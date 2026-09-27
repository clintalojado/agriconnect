import { useEffect, useRef, useState } from "react";
import { apiClient } from "../api/client";
import { navigate } from "../lib/router";
import { useSession } from "../lib/session";
import { Alert, Badge, Button, Input, Textarea, cx } from "../components/ui.jsx";
import { CheckIcon, EditIcon, GlobeIcon, MicIcon, SparkleIcon, TrashIcon } from "../components/icons.jsx";

// "Type or speak it": the farmer writes in their own words (Tagalog, Bisaya,
// English), the NLP service structures it, the farmer checks and confirms.

const EXAMPLES = [
  { lang: "Tagalog", text: "Pwede po mag-order ng 5 sako urea at 2 sako abono, kailangan bago mag Oktubre" },
  { lang: "Bisaya", text: "Palihug ko og lima ka sako 14-14-14 ug duha ka sako amsul sunod semana" },
  { lang: "English", text: "Need 3 sacks chicken feed and 2 bottles insecticide next week" },
];

const LANGUAGE_LABEL = { tagalog: "Tagalog", bisaya: "Bisaya", english: "English", mixed: "Mixed", other: "Unclear" };
const UNITS = ["sacks", "bags", "kg", "liters", "bottles", "packs"];

const SpeechRecognition = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

function useDictation(onText) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  useEffect(() => () => recognitionRef.current?.abort(), []);

  function start(lang) {
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.interimResults = false;
    recognition.onresult = (e) => onTextRef.current(Array.from(e.results).map((r) => r[0].transcript).join(" "));
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }
  return { supported: Boolean(SpeechRecognition), listening, start, stop: () => recognitionRef.current?.stop() };
}

function ConfidenceMeter({ score }) {
  const level = !(score > 0.05) ? 0 : score >= 0.75 ? 3 : score >= 0.4 ? 2 : 1;
  const color = level === 3 ? "bg-brand-500" : level === 2 ? "bg-harvest-400" : "bg-red-400";
  return (
    <span className="inline-flex items-end gap-0.5" title={`Confidence ${Math.round((score || 0) * 100)}%`}>
      {[1, 2, 3].map((bar) => (
        <span key={bar} className={cx("w-1 rounded-sm", bar <= level ? color : "bg-stone-200")} style={{ height: 4 + bar * 3 }} />
      ))}
    </span>
  );
}

export default function AiComposer() {
  const { me } = useSession();
  const [text, setText] = useState("");
  const [lang, setLang] = useState("fil-PH");
  const [draft, setDraft] = useState(null); // { requestId, meta, items: [{product_name, quantity, unit, confidence?}], preferred_date }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const dictation = useDictation((t) => setText((prev) => (prev ? `${prev} ${t}` : t)));

  async function read(e) {
    e.preventDefault();
    if (!text.trim()) return setError("Please type or say what you need first.");
    setBusy(true);
    setError(null);
    try {
      const { request, extraction } = await apiClient.post("/requests/submit", { farmer_id: me.id, raw_message: text });
      const items = [
        { product_name: extraction.product_name, quantity: extraction.quantity, unit: extraction.unit, confidence: extraction.confidence },
        ...(extraction.additional_items || []),
      ].filter((i) => i.product_name);
      setDraft({
        requestId: request.id,
        meta: extraction,
        items: items.length ? items : [{ product_name: "", quantity: null, unit: "" }],
        preferred_date: extraction.preferred_date || "",
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function updateItem(index, field, value) {
    setDraft((d) => ({ ...d, items: d.items.map((it, i) => (i === index ? { ...it, [field]: value } : it)) }));
  }

  const invalid = draft?.items.some((i) => !i.product_name?.trim() || !(Number(i.quantity) > 0) || !i.unit?.trim());

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const [first, ...rest] = draft.items;
      const neededIso = draft.preferred_date === draft.meta.preferred_date ? draft.meta.preferred_date_iso : null;
      // The first item confirms the AI draft; the others become their own requests.
      const main = await apiClient.post("/requests/validate", {
        id: draft.requestId,
        product_name: first.product_name,
        quantity: Number(first.quantity),
        unit: first.unit,
        barangay: draft.meta.barangay,
        preferred_date: draft.preferred_date || null,
        needed_by: neededIso,
      });
      for (const item of rest) {
        await apiClient.post("/requests/create", {
          farmer_id: me.id,
          product_name: item.product_name,
          quantity: Number(item.quantity),
          unit: item.unit,
          preferred_date: draft.preferred_date || null,
          needed_by: neededIso,
          raw_message: text,
        });
      }
      navigate(rest.length ? "/requests" : `/requests/${main.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (draft) {
    const m = draft.meta;
    return (
      <div className="space-y-5">
        <div className="rounded-2xl bg-stone-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">You wrote</p>
          <p className="mt-1 text-sm italic text-stone-700">“{text}”</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge tone="blue">
              <GlobeIcon className="h-3 w-3" /> {LANGUAGE_LABEL[m.language] || m.language}
            </Badge>
            <Badge tone={m.intent === "purchase_request" ? "green" : "amber"}>
              {m.intent === "purchase_request" ? "Order" : m.intent === "inquiry" ? "Question" : "Unclear"}
            </Badge>
            <Badge tone={m.source === "ai" ? "violet" : "stone"}>{m.source === "ai" ? "Read by AI" : "Read by offline parser"}</Badge>
          </div>
        </div>
        {m.clarification_question && <Alert tone="warning" title="Please check">{m.clarification_question}</Alert>}
        {error && <Alert tone="error">{error}</Alert>}

        <div>
          <p className="mb-2 text-sm font-bold text-stone-800">Products ({draft.items.length})</p>
          <div className="space-y-2.5">
            {draft.items.map((item, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px_104px_auto] items-center gap-2 rounded-2xl border border-stone-200 p-2.5">
                <Input value={item.product_name || ""} onChange={(e) => updateItem(i, "product_name", e.target.value)} placeholder="Product" aria-label="Product" />
                <Input type="number" min="0" value={item.quantity ?? ""} onChange={(e) => updateItem(i, "quantity", e.target.value)} placeholder="Qty" aria-label="Quantity" />
                <select value={item.unit || ""} onChange={(e) => updateItem(i, "unit", e.target.value)} className="input" aria-label="Unit">
                  <option value="">Unit</option>
                  {UNITS.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
                {i === 0 ? (
                  <ConfidenceMeter score={item.confidence?.product_name} />
                ) : (
                  <button
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((_, j) => j !== i) }))}
                    className="rounded-lg p-2 text-stone-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Remove product"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-sm font-semibold text-stone-700">Barangay</p>
            <Input value={draft.meta.barangay || ""} readOnly className="bg-stone-50" />
          </div>
          <div>
            <p className="mb-1.5 text-sm font-semibold text-stone-700">Needed by</p>
            <Input value={draft.preferred_date} onChange={(e) => setDraft((d) => ({ ...d, preferred_date: e.target.value }))} placeholder="e.g. next week" />
            {m.preferred_date_iso && draft.preferred_date === m.preferred_date && (
              <p className="mt-1 text-xs text-stone-500">≈ {new Date(`${m.preferred_date_iso}T00:00:00`).toDateString()}</p>
            )}
          </div>
        </div>
        {invalid && <p className="text-xs font-medium text-stone-500">Each product needs a name, a quantity above zero, and a unit.</p>}
        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <Button variant="secondary" icon={EditIcon} className="sm:flex-1" onClick={() => setDraft(null)}>
            Edit message
          </Button>
          <Button icon={CheckIcon} className="sm:flex-1" loading={busy} disabled={invalid} onClick={confirm}>
            Submit {draft.items.length > 1 ? `${draft.items.length} requests` : "request"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={read} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="relative">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          maxLength={1000}
          placeholder='e.g. "palit ko 5 sako urea ug 2 sako abono, hatod sa Brgy. Katipunan sunod semana"'
          className="pb-12"
          aria-label="Your request in your own words"
        />
        <div className="absolute inset-x-3 bottom-2.5 flex items-center justify-between gap-2">
          {dictation.supported ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => (dictation.listening ? dictation.stop() : dictation.start(lang))}
                className={cx(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold",
                  dictation.listening ? "animate-pulse bg-red-500 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                )}
              >
                <MicIcon className="h-4 w-4" /> {dictation.listening ? "Listening… tap to stop" : "Speak"}
              </button>
              {!dictation.listening && (
                <select value={lang} onChange={(e) => setLang(e.target.value)} className="h-8 rounded-lg border-none bg-transparent text-xs text-stone-500 focus:ring-0" aria-label="Speech language">
                  <option value="fil-PH">Tagalog</option>
                  <option value="en-PH">English</option>
                </select>
              )}
            </div>
          ) : (
            <span />
          )}
          <span className="text-[11px] text-stone-400">{text.length}/1000</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex.lang}
            type="button"
            onClick={() => setText(ex.text)}
            className="max-w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-left text-xs text-stone-600 hover:border-brand-300 hover:bg-brand-50"
          >
            <span className="mb-0.5 flex items-center gap-1 font-bold text-stone-800">
              <GlobeIcon className="h-3.5 w-3.5" /> {ex.lang}
            </span>
            <span className="line-clamp-1">{ex.text}</span>
          </button>
        ))}
      </div>
      <Button type="submit" size="lg" loading={busy} icon={SparkleIcon} className="w-full">
        {busy ? "Reading your message…" : "Read my request"}
      </Button>
    </form>
  );
}
