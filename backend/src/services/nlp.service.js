const Anthropic = require("@anthropic-ai/sdk");
const { z } = require("zod");
const { betaZodOutputFormat } = require("@anthropic-ai/sdk/helpers/beta/zod");
const { extractWithRules, isoDate } = require("./nlp/rules");
const { canonicalProduct, canonicalUnit } = require("./nlp/lexicon");
const { confirmationReply, clarificationQuestion, intentReply } = require("./nlp/replies");

// NLP_MODE:
//   auto  (default) — Claude API, falling back to the offline rule-based parser
//                     when the API is unconfigured, down, or rate limited
//   ai    — Claude API only; errors are surfaced to the caller
//   rules — offline rule-based parser only (no network)
const NLP_MODE = (process.env.NLP_MODE || "auto").toLowerCase();

const FIELDS = ["product_name", "quantity", "unit", "barangay", "preferred_date"];

const ExtractionSchema = z.object({
  product_name: z.string().nullable(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  barangay: z.string().nullable(),
  preferred_date: z.string().nullable(),
  preferred_date_iso: z.string().nullable(),
  intent: z.enum(["purchase_request", "inquiry", "other"]),
  language: z.enum(["tagalog", "bisaya", "english", "mixed", "other"]),
  additional_items: z.array(
    z.object({
      product_name: z.string(),
      quantity: z.number().nullable(),
      unit: z.string().nullable(),
    })
  ),
  clarification_question: z.string().nullable(),
  reply_message: z.string(),
  confidence: z.object({
    product_name: z.number(),
    quantity: z.number(),
    unit: z.number(),
    barangay: z.number(),
    preferred_date: z.number(),
  }),
});

const SYSTEM_PROMPT = `You extract structured farm-input order details from informal messages written by small-scale Filipino farmers, sent through a web form or by SMS. Messages may be in Tagalog, Bisaya/Cebuano, informal English, or a mix, and often contain misspellings, text-speak ("pls", "kc", "2mrw"), and little punctuation.

Fields:
- product_name: the main farm input requested. Use these canonical names when they apply: "Urea (46-0-0)", "Complete fertilizer (14-14-14)", "Ammonium sulfate (21-0-0)", "Ammophos (16-20-0)", "Muriate of potash (0-0-60)", "Organic fertilizer", "Hybrid corn seeds", "Rice seeds", "Herbicide", "Insecticide", "Fungicide", "Hog grower feed", "Chicken feed". Otherwise a short clean product name. Null if none is mentioned.
- quantity: the numeric amount of the main product, converting number words (e.g. "sampung" = 10, "napulo" = 10, "lima" = 5). Null if not stated.
- unit: one of "sacks", "kg", "liters", "bottles", "packs" when it fits ("sako", "bag", "kaban" → "sacks"; "kilo" → "kg"; "litro" → "liters"), otherwise the stated unit. If a fertilizer count has no unit, use "sacks". Null if not stated and not inferable.
- barangay: the barangay named in the message. Null if not stated (do not guess from the farmer's profile — that is filled in separately).
- preferred_date: the requested timing, kept close to the farmer's phrasing (e.g. "before May", "sunod buwan"). Null if not stated.
- preferred_date_iso: your best-guess deadline for preferred_date as YYYY-MM-DD, using the date given in the message context ("before May" → the last day of April; "next month" → the 1st of next month; "tomorrow"/"ugma"/"bukas" → the next day). Null when preferred_date is null.
- intent: "purchase_request" if the farmer wants to order or reserve inputs, "inquiry" if they are only asking about price or availability, "other" otherwise (greetings, complaints, unrelated).
- language: the main language of the message; "mixed" when two languages carry roughly equal weight.
- additional_items: any other products requested in the same message besides the main one (empty list if none).
- clarification_question: when intent is "purchase_request" but product_name, quantity, or unit is missing, one short friendly question in the farmer's language asking for exactly what is missing. Otherwise null.
- reply_message: a reply of at most 300 characters in the farmer's language (use Tagalog for mixed messages), polite and plain, suitable for SMS. For a complete purchase request, restate the order and say suppliers will be notified. For an incomplete one, it is the clarification question. For an inquiry, acknowledge it and say prices will be checked. Never promise a price, stock, or delivery date.
- confidence: a 0-1 score per field (product_name, quantity, unit, barangay, preferred_date): near 1.0 for explicit unambiguous values, lower for inferred or ambiguous ones, near 0 when the field is null.

Examples:
"pwd po mag request ng 10 sako urea para sa amo barangay San Isidro, kailangan before May" → product_name "Urea (46-0-0)", quantity 10, unit "sacks", barangay "San Isidro", preferred_date "before May", intent "purchase_request", language "tagalog".
"palihug ko og lima ka sako 14-14-14 ug duha ka sako amsul sunod semana" → product_name "Complete fertilizer (14-14-14)", quantity 5, unit "sacks", additional_items [{"product_name": "Ammonium sulfate (21-0-0)", "quantity": 2, "unit": "sacks"}], preferred_date "sunod semana", language "bisaya".
"magkano po ang urea ngayon?" → product_name "Urea (46-0-0)", quantity null, intent "inquiry", clarification_question null.`;

const client = new Anthropic();

// Set once a request fails because no credentials are configured, so later
// requests go straight to the rule-based parser instead of retrying the API.
let credentialsMissing = false;
let lastEngine = null;

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function upstreamError(message, status = 502, { fallbackable = true } = {}) {
  const err = new Error(message);
  err.status = status;
  err.fallbackable = fallbackable;
  return err;
}

function buildUserContent(rawMessage, { today, profileBarangay }) {
  const context = [`Today's date: ${isoDate(today)} (Philippines).`];
  if (profileBarangay) context.push(`Farmer's registered barangay: ${profileBarangay}.`);
  return `${context.join("\n")}\n\nFarmer's message:\n"""\n${rawMessage}\n"""`;
}

async function extractWithClaude(rawMessage, context) {
  if (credentialsMissing) {
    throw upstreamError("NLP service is not configured (no Anthropic credentials found)", 500);
  }

  let response;
  try {
    response = await client.beta.messages.parse({
      model: "claude-opus-5",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserContent(rawMessage, context) }],
      output_config: {
        format: betaZodOutputFormat(ExtractionSchema),
        effort: "low",
      },
      // If a safety classifier declines the request, the API retries it on a
      // fallback model server-side instead of returning a refusal.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw upstreamError("NLP service is not configured correctly (invalid API key)", 500);
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw upstreamError("NLP service is rate limited, please try again shortly", 429);
    }
    if (error instanceof Anthropic.BadRequestError) {
      throw upstreamError(`NLP service rejected the request: ${error.message}`, 502, { fallbackable: false });
    }
    if (error instanceof Anthropic.APIError) {
      throw upstreamError(`NLP service error: ${error.message}`, 502);
    }
    if (error instanceof Anthropic.AnthropicError) {
      throw upstreamError(`NLP service returned an unparsable response: ${error.message}`, 502);
    }
    if (/authentication method/i.test(error.message)) {
      credentialsMissing = true;
      throw upstreamError("NLP service is not configured (no Anthropic credentials found)", 500);
    }
    throw error;
  }

  if (response.stop_reason === "refusal") {
    throw upstreamError("NLP service declined to process this message", 422, { fallbackable: false });
  }
  if (!response.parsed_output) {
    throw upstreamError("NLP extraction failed to produce structured output", 502);
  }
  return response.parsed_output;
}

// Shared post-processing for both extraction paths: canonical product/unit
// names (so aggregation groups consistently), barangay defaulting from the
// farmer's profile, missing-field detection, and a reply in the farmer's language.
function finalize(extraction, { profileBarangay, source }) {
  const result = { ...extraction, confidence: { ...extraction.confidence } };

  const product = canonicalProduct(result.product_name);
  if (product && !product.generic) result.product_name = product.name;
  result.unit = canonicalUnit(result.unit) || result.unit;
  result.additional_items = (result.additional_items || []).map((item) => ({
    ...item,
    product_name: canonicalProduct(item.product_name)?.name || item.product_name,
    unit: canonicalUnit(item.unit) || item.unit,
  }));

  result.barangay_source = result.barangay ? "message" : null;
  if (!result.barangay && profileBarangay) {
    result.barangay = profileBarangay;
    result.barangay_source = "profile";
    result.confidence.barangay = 0.6;
  }

  result.missing_fields = ["product_name", "quantity", "unit", "barangay"].filter(
    (field) => result[field] == null || result[field] === ""
  );

  if (result.intent === "purchase_request") {
    const needsClarifying = result.missing_fields.some((f) => f === "product_name" || f === "quantity" || f === "unit");
    if (needsClarifying) {
      result.clarification_question =
        result.clarification_question || clarificationQuestion(result.language, result.missing_fields);
      // Always ask, even if the model wrote a confirmation: the order can't be pooled yet.
      result.reply_message = result.clarification_question;
    } else {
      result.clarification_question = null;
      result.reply_message = result.reply_message || confirmationReply(result.language, result);
    }
  } else {
    result.clarification_question = null;
    result.reply_message = result.reply_message || intentReply(result.language, result.intent);
  }

  for (const field of FIELDS) {
    const score = Number(result.confidence[field]);
    result.confidence[field] = Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0;
  }

  result.source = source;
  return result;
}

/**
 * Extract structured order details from a farmer's free-text message.
 *
 * @param {string} rawMessage
 * @param {{ profileBarangay?: string, today?: Date }} [options]
 * @returns extraction + { source: "ai" | "rules", fallback_reason?, missing_fields, barangay_source }
 */
async function extractFarmInputRequest(rawMessage, { profileBarangay = null, today = new Date() } = {}) {
  if (typeof rawMessage !== "string" || !rawMessage.trim()) {
    throw badRequest("raw_message must be a non-empty string");
  }
  const context = { profileBarangay, today };

  if (NLP_MODE === "rules") {
    lastEngine = "rules";
    return finalize(extractWithRules(rawMessage, context), { profileBarangay, source: "rules" });
  }

  try {
    const extraction = await extractWithClaude(rawMessage, context);
    lastEngine = "ai";
    return finalize(extraction, { profileBarangay, source: "ai" });
  } catch (error) {
    if (NLP_MODE === "ai" || !error.fallbackable) throw error;
    if (!credentialsMissing) console.warn(`[nlp] falling back to rule-based parser: ${error.message}`);
    lastEngine = "rules";
    const result = finalize(extractWithRules(rawMessage, context), { profileBarangay, source: "rules" });
    result.fallback_reason = error.message;
    return result;
  }
}

function getNlpStatus() {
  let activeEngine = "ai";
  if (NLP_MODE === "rules" || credentialsMissing) activeEngine = "rules";
  return {
    mode: NLP_MODE,
    active_engine: activeEngine,
    last_engine: lastEngine, // engine that handled the most recent message, null before the first
  };
}

module.exports = { extractFarmInputRequest, getNlpStatus, ExtractionSchema };
