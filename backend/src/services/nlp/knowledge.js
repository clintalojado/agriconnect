// Knowledge base: the bot's answer for each intent the classifier recognises
// (greetings, how to order, delivery areas, order status, payment, farming
// advice, …). Answers use live data where it exists — suppliers' delivery
// coverage, the farmer's requests, current prices, AgriPoints — and come in
// the farmer's language (Tagalog, Bisaya, or English).

const { getDb } = require("../../db/connection");
const { findBarangayInText, MUNICIPALITY } = require("../locations");
const { getPoints } = require("../points.service");
const { money, perUnit } = require("../../utils/format");

function say(language, { tl, bis, en }) {
  if (language === "bisaya") return bis;
  if (language === "english") return en;
  return tl;
}

const ORDER_EXAMPLE = { tl: '"5 sako urea, sa Katipunan, sunod linggo"', bis: '"5 ka sako urea, sa Katipunan, sunod semana"', en: '"5 sacks urea, Katipunan, next week"' };

function lowestPrice(productName) {
  return getDb()
    .prepare(
      `SELECT sp.price, sp.unit, s.name AS supplier_name FROM supplier_products sp
       JOIN products p ON p.id = sp.product_id JOIN suppliers s ON s.id = sp.supplier_id
       WHERE p.name = ? AND sp.in_stock = 1 AND s.verified = 1 ORDER BY sp.price LIMIT 1`
    )
    .get(productName);
}

function priceTag(productName) {
  const l = lowestPrice(productName);
  return l ? `${productName} ${money(l.price)}/${perUnit(l.unit)}` : null;
}

function verifiedSuppliers() {
  return getDb()
    .prepare(
      `SELECT s.name, s.barangay, s.municipality, s.coverage_barangays,
              (SELECT ROUND(AVG(rating), 1) FROM reviews r WHERE r.supplier_id = s.id) AS rating
       FROM suppliers s WHERE s.verified = 1 ORDER BY s.name`
    )
    .all();
}

// ---------- Farming advice (general guidance; amounts depend on soil tests) ----------

function farmingAdvice(text, language) {
  const t = text.toLowerCase();
  const pest = /peste|ulod|uod|insekto|insect|stem ?borer|leaf ?folder|kuto|tambal|gamot|spray/.test(t);
  const disease = /blast|blight|fung|amag|sakit|lapok|naninilaw|dalag|yellow/.test(t);
  const weeds = /damo|weed|sagbot|herbicide/.test(t);
  const corn = /mais|corn/.test(t);
  const veg = /gulay|vegetable|utanon|kamatis|talong|pechay/.test(t);
  const footer = say(language, {
    tl: "\nPara sa eksaktong dami, magpa-soil test o magtanong sa Municipal Agriculture Office (MAO).",
    bis: "\nPara sa eksaktong gidaghanon, pa-soil test o pangutana sa Municipal Agriculture Office (MAO).",
    en: "\nFor exact amounts, get a soil test or ask your Municipal Agriculture Office (MAO).",
  });

  if (pest || disease || weeds) {
    const lines = [];
    if (pest) lines.push(say(language, { tl: "• Insekto (stem borer, leaf folder, uod): Insecticide", bis: "• Insekto (stem borer, leaf folder, ulod): Insecticide", en: "• Insects (stem borer, leaf folder, worms): Insecticide" }));
    if (disease) lines.push(say(language, { tl: "• Sakit tulad ng blast o blight: Fungicide. Ang paninilaw ay puwede ring kulang sa nitrogen (Urea).", bis: "• Sakit sama sa blast o blight: Fungicide. Ang pagdalag pwede sab kulang sa nitrogen (Urea).", en: "• Diseases like blast or blight: Fungicide. Yellowing can also mean low nitrogen (Urea)." }));
    if (weeds) lines.push(say(language, { tl: "• Damo: Herbicide (pre- o post-emergence)", bis: "• Sagbot: Herbicide (pre- o post-emergence)", en: "• Weeds: Herbicide (pre- or post-emergence)" }));
    const prices = ["Insecticide", "Fungicide", "Herbicide"].map(priceTag).filter(Boolean);
    return (
      say(language, { tl: "Karaniwang gamit:", bis: "Kasagarang gamit:", en: "Commonly used:" }) +
      `\n${lines.join("\n")}\n` +
      say(language, {
        tl: "Basahin ang label, sundin ang tamang dosis, at magsuot ng proteksyon sa pag-spray.",
        bis: "Basaha ang label, sunda ang saktong dosis, ug pagsul-ob og proteksyon sa pag-spray.",
        en: "Read the label, follow the dose, and wear protection when spraying.",
      }) +
      (prices.length ? `\n${say(language, { tl: "Presyo ngayon", bis: "Presyo karon", en: "Prices now" })}: ${prices.join(", ")}` : "") +
      footer
    );
  }

  if (corn) {
    const prices = ["Complete fertilizer (14-14-14)", "Urea (46-0-0)", "Hybrid corn seeds"].map(priceTag).filter(Boolean);
    return (
      say(language, {
        tl: "Sa mais, karaniwan: Complete (14-14-14) sa pagtanim, tapos Urea bilang side-dress mga 25–30 araw pagkatanim.",
        bis: "Sa mais, kasagaran: Complete (14-14-14) sa pagtanom, dayon Urea isip side-dress mga 25–30 ka adlaw human sa pagtanom.",
        en: "For corn, typically: Complete (14-14-14) at planting, then Urea as side-dress about 25–30 days after planting.",
      }) +
      (prices.length ? `\n${say(language, { tl: "Presyo ngayon", bis: "Presyo karon", en: "Prices now" })}: ${prices.join(", ")}` : "") +
      footer
    );
  }

  if (veg) {
    return (
      say(language, {
        tl: "Sa gulay, maganda ang Organic fertilizer (compost/vermicast) sa paghahanda ng lupa, dagdagan ng Complete (14-14-14) kung kailangan.",
        bis: "Sa utanon, maayo ang Organic fertilizer (compost/vermicast) sa pag-andam sa yuta, dugangi og Complete (14-14-14) kon kinahanglan.",
        en: "For vegetables, Organic fertilizer (compost/vermicast) when preparing the soil, plus Complete (14-14-14) if needed.",
      }) + footer
    );
  }

  // Default: rice (palay/humay), the main crop in M'lang.
  const prices = ["Complete fertilizer (14-14-14)", "Urea (46-0-0)", "Muriate of potash (0-0-60)"].map(priceTag).filter(Boolean);
  return (
    say(language, {
      tl: "Sa palay, karaniwan: Complete (14-14-14) bilang basal bago o sa pagtanim; Urea bilang top-dress sa tillering at panicle initiation; Potash (0-0-60) para sa pagpuno ng butil.",
      bis: "Sa humay, kasagaran: Complete (14-14-14) isip basal sa wala pa o sa pagtanom; Urea isip top-dress sa tillering ug panicle initiation; Potash (0-0-60) para sa pagpuno sa lugas.",
      en: "For rice, typically: Complete (14-14-14) as basal before or at planting; Urea as top-dress at tillering and panicle initiation; Potash (0-0-60) for grain filling.",
    }) +
    (prices.length ? `\n${say(language, { tl: "Presyo ngayon", bis: "Presyo karon", en: "Prices now" })}: ${prices.join(", ")}` : "") +
    footer
  );
}

// ---------- Answers per intent ----------

/**
 * @param intent   classifier intent
 * @param context  { text, language, farmer (row or null), statusReply(farmer) }
 * @returns { reply, escalate? } — escalate=true when staff should follow up.
 */
function answerIntent(intent, { text, language, farmer, statusReply }) {
  const name = farmer?.name?.split(" ")[0];

  switch (intent) {
    case "greeting":
      return {
        reply: say(language, {
          tl: `Magandang araw${name ? `, ${name}` : ""}! Ako ang AgriConnect bot 🌾 Puwede kayong mag-order ng abono, binhi, gamot, at feeds dito. I-text lang ang kailangan, hal. ${ORDER_EXAMPLE.tl}. O itanong ang presyo, delivery, o STATUS ng order.`,
          bis: `Maayong adlaw${name ? `, ${name}` : ""}! Ako ang AgriConnect bot 🌾 Pwede mo mo-order og abono, liso, tambal, ug feeds diri. I-text lang ang kinahanglan, pananglitan ${ORDER_EXAMPLE.bis}. O pangutana sa presyo, delivery, o STATUS sa order.`,
          en: `Hello${name ? `, ${name}` : ""}! I'm the AgriConnect bot 🌾 You can order fertilizer, seeds, pesticides, and feeds here. Just text what you need, e.g. ${ORDER_EXAMPLE.en}. Or ask about prices, delivery, or your order STATUS.`,
        }),
      };
    case "thanks":
      return { reply: say(language, { tl: "Walang anuman po! Nandito lang kami kung may kailangan pa kayo. 🌾", bis: "Walay sapayan! Ania ra mi kung naa pa kay kinahanglan. 🌾", en: "You're welcome! We're here whenever you need farm inputs. 🌾" }) };
    case "acknowledge":
      return { reply: say(language, { tl: `Sige po! I-text lang kung may order kayo, hal. ${ORDER_EXAMPLE.tl}.`, bis: `Sige! I-text lang kung naa kay order, pananglitan ${ORDER_EXAMPLE.bis}.`, en: `Okay! Text us anytime to order, e.g. ${ORDER_EXAMPLE.en}.` }) };
    case "goodbye":
      return { reply: say(language, { tl: "Paalam po, ingat! Mag-text lang ulit kung may kailangan. 🌾", bis: "Babay, amping! Text lang usab kung naa kay kinahanglan. 🌾", en: "Goodbye, take care! Message us again anytime. 🌾" }) };

    case "how_to_order":
      return {
        reply: say(language, {
          tl: `Madali lang po:\n1) I-text ang produkto, dami, at lugar — hal. ${ORDER_EXAMPLE.tl}\n2) Ipapakita namin ang nabasa namin; i-reply ang OO para i-confirm.\n3) Magpapadala ng quote ang mga verified supplier; piliin ang gusto ninyo.\n4) Ide-deliver sa barangay ninyo. I-text ang STATUS para makita ang order.`,
          bis: `Sayon ra:\n1) I-text ang produkto, gidaghanon, ug lugar — pananglitan ${ORDER_EXAMPLE.bis}\n2) Ipakita namo ang among nabasa; i-reply ang OO aron i-confirm.\n3) Mopadala og quote ang mga verified supplier; pilia ang gusto nimo.\n4) Ihatod sa inyong barangay. I-text ang STATUS aron makita ang order.`,
          en: `It's easy:\n1) Text the product, quantity, and place — e.g. ${ORDER_EXAMPLE.en}\n2) We show what we understood; reply YES to confirm.\n3) Verified suppliers send quotations; choose the one you like.\n4) It's delivered to your barangay. Text STATUS to check your order.`,
        }),
      };

    case "price": {
      const tags = ["Urea (46-0-0)", "Complete fertilizer (14-14-14)", "Rice seeds", "Hybrid corn seeds", "Chicken feed"].map(priceTag).filter(Boolean);
      if (!tags.length) return { reply: say(language, { tl: "Wala pang nakalistang presyo. I-text ang produkto at dami para humingi ng quote.", bis: "Wala pay presyo nga nakalista. I-text ang produkto ug gidaghanon aron mangayo og quote.", en: "No prices listed yet. Text the product and quantity to ask for quotations." }) };
      return {
        reply:
          say(language, { tl: "Pinakamababang presyo ngayon mula sa verified suppliers:", bis: "Pinakaubos nga presyo karon gikan sa verified suppliers:", en: "Lowest prices now from verified suppliers:" }) +
          `\n• ${tags.join("\n• ")}\n` +
          say(language, { tl: 'Itanong ang ibang produkto, hal. "magkano ang potash?"', bis: 'Pangutana sa uban nga produkto, pananglitan "pila ang potash?"', en: 'Ask about any product, e.g. "how much is potash?"' }),
      };
    }

    case "availability":
      return { reply: say(language, { tl: 'Aling produkto po? I-text ang pangalan, hal. "may urea ba?" o "magkano ang 14-14-14?"', bis: 'Unsang produkto? I-text ang ngalan, pananglitan "naa bay urea?" o "pila ang 14-14-14?"', en: 'Which product? Text its name, e.g. "is urea available?" or "how much is 14-14-14?"' }) };

    case "delivery_area": {
      const barangay = findBarangayInText(text) || null;
      const suppliers = verifiedSuppliers();
      if (barangay) {
        const covering = suppliers.filter((s) => (s.coverage_barangays || "").toLowerCase().includes(barangay.toLowerCase()));
        if (covering.length) {
          return {
            reply:
              say(language, { tl: `Oo po! Nagde-deliver sa Brgy. ${barangay}:`, bis: `Oo! Naghatod sa Brgy. ${barangay}:`, en: `Yes! These suppliers deliver to Brgy. ${barangay}:` }) +
              `\n• ${covering.map((s) => s.name).join("\n• ")}\n` +
              say(language, { tl: "Ang delivery fee ay nakasulat sa bawat quote. Puwede ring pickup.", bis: "Ang delivery fee nakasulat sa matag quote. Pwede pud pickup.", en: "The delivery fee is shown on each quotation. Pickup is also possible." }),
          };
        }
        return {
          reply: say(language, {
            tl: `Wala pang supplier na naka-set mag-deliver sa Brgy. ${barangay}, pero puwede pa rin kayong mag-order — makikita ng mga supplier ang request at puwede silang mag-alok ng delivery o pickup.`,
            bis: `Wala pay supplier nga naka-set maghatod sa Brgy. ${barangay}, pero pwede gihapon mo mo-order — makita sa mga supplier ang request ug pwede sila mohalad og delivery o pickup.`,
            en: `No supplier lists Brgy. ${barangay} in their delivery area yet, but you can still order — suppliers see the request and can offer delivery or pickup.`,
          }),
        };
      }
      const areas = [...new Set(suppliers.flatMap((s) => (s.coverage_barangays || "").split(",").map((b) => b.trim()).filter(Boolean)))];
      return {
        reply:
          say(language, { tl: "Oo po, may delivery sa barangay ninyo! Nagde-deliver ngayon ang mga supplier sa:", bis: "Oo, naay delivery sa inyong barangay! Karon naghatod ang mga supplier sa:", en: "Yes, suppliers deliver to your barangay! Current delivery areas:" }) +
          ` ${areas.join(", ") || MUNICIPALITY}.\n` +
          say(language, { tl: "Aling barangay po kayo? Ang delivery fee ay nasa bawat quote.", bis: "Asa kang barangay? Ang delivery fee naa sa matag quote.", en: "Which barangay are you in? The delivery fee is shown on each quotation." }),
      };
    }

    case "order_status":
      if (!farmer) return { reply: say(language, { tl: "Wala pa kayong order dahil hindi pa kayo naka-register. I-text ang REG Pangalan, Barangay, Bayan para magsimula.", bis: "Wala pa kay order kay wala pa ka naka-register. I-text ang REG Ngalan, Barangay, Lungsod aron magsugod.", en: "You have no orders yet because you're not registered. Text REG Name, Barangay, Town to start." }) };
      return { reply: statusReply(farmer) };

    case "cancel_order":
      return {
        reply: say(language, {
          tl: "Para kanselahin: kung hinihintay pa ang OO, i-reply lang ang MALI. Kung may order na, puwede itong i-cancel sa AgriConnect app (Orders) habang hindi pa ide-deliver. Ipinaalam din namin sa staff ang mensahe ninyo.",
          bis: "Aron i-cancel: kung naghulat pa sa OO, i-reply lang ang MALI. Kung naa nay order, pwede kini i-cancel sa AgriConnect app (Orders) samtang wala pa ihatod. Gipahibalo usab namo ang staff.",
          en: "To cancel: if we're still waiting for your YES, just reply NO. If an order was already placed, cancel it in the AgriConnect app (Orders) before it's out for delivery. We've also told the staff.",
        }),
        escalate: true,
      };

    case "payment":
      return {
        reply: say(language, {
          tl: "Libre ang paggamit ng AgriConnect. Ang bayad sa produkto ay diretso sa supplier — karaniwan cash on delivery o sa pickup; ang ibang paraan (hal. GCash) ay depende sa supplier. Puwede ninyo itong pag-usapan sa chat bago tanggapin ang quote.",
          bis: "Libre ang paggamit sa AgriConnect. Ang bayad sa produkto diretso sa supplier — kasagaran cash on delivery o sa pickup; ang uban nga paagi (sama sa GCash) depende sa supplier. Pwede ninyo kini hisgutan sa chat sa dili pa dawaton ang quote.",
          en: "AgriConnect is free to use. You pay the supplier directly — usually cash on delivery or at pickup; other methods (e.g. GCash) depend on the supplier. You can agree on it in chat before accepting a quotation.",
        }),
      };

    case "hours":
      return {
        reply: say(language, {
          tl: "Bukas ang AgriConnect 24/7 dito sa Messenger at SMS — puwede kayong mag-order anumang oras. Ang mga supplier ay sumasagot sa oras ng kanilang tindahan.",
          bis: "Abli ang AgriConnect 24/7 diri sa Messenger ug SMS — pwede mo mo-order bisan unsang orasa. Ang mga supplier motubag sa oras sa ilang tindahan.",
          en: "AgriConnect is open 24/7 here on Messenger and SMS — order anytime. Suppliers respond during their store hours.",
        }),
      };

    case "location": {
      const list = verifiedSuppliers().slice(0, 4).map((s) => `${s.name} (${[s.barangay, s.municipality].filter(Boolean).join(", ")})`);
      return {
        reply:
          say(language, {
            tl: `Online ang AgriConnect para sa mga barangay ng ${MUNICIPALITY}, Cotabato — hindi na kailangang pumunta sa bayan. Mga verified supplier na puwedeng pag-pickup-an:`,
            bis: `Online ang AgriConnect para sa mga barangay sa ${MUNICIPALITY}, Cotabato — dili na kinahanglan moadto sa lungsod. Mga verified supplier nga pwede kuhaan:`,
            en: `AgriConnect is online, serving the barangays of ${MUNICIPALITY}, Cotabato — no need to travel to town. Verified suppliers for pickup:`,
          }) + (list.length ? `\n• ${list.join("\n• ")}` : ""),
      };
    }

    case "about":
      return {
        reply: say(language, {
          tl: "Ang AgriConnect ay nag-uugnay sa mga magsasaka at verified na agri-supplier. Mag-text ng order sa sariling salita (Tagalog, Bisaya, English), ikumpara ang mga quote, at ipa-deliver sa barangay. Ako ang automated bot; ang staff ng barangay/kooperatiba ang nagbe-verify at tumutulong.",
          bis: "Ang AgriConnect nagkonektar sa mga mag-uuma ug verified nga agri-supplier. I-text ang order sa kaugalingong pulong (Bisaya, Tagalog, English), itandi ang mga quote, ug ipahatod sa barangay. Ako ang automated bot; ang staff sa barangay/kooperatiba ang nag-verify ug motabang.",
          en: "AgriConnect connects farmers with verified agri-input suppliers. Text your order in your own words (Tagalog, Bisaya, English), compare quotations, and get it delivered to your barangay. I'm the automated bot; barangay/cooperative staff verify accounts and help out.",
        }),
      };

    case "suppliers": {
      const list = verifiedSuppliers().map((s) => `${s.name}${s.rating ? ` ★${s.rating}` : ""}`);
      return {
        reply:
          say(language, { tl: "Mga verified supplier sa AgriConnect:", bis: "Mga verified supplier sa AgriConnect:", en: "Verified suppliers on AgriConnect:" }) +
          `\n• ${list.join("\n• ") || "—"}\n` +
          say(language, { tl: "Kapag nag-order kayo, sila mismo ang magpapadala ng quote para maikumpara ninyo.", bis: "Kung mo-order mo, sila mismo ang mopadala og quote aron inyong itandi.", en: "When you order, they send quotations so you can compare." }),
      };
    }

    case "farming_advice":
      return { reply: farmingAdvice(text, language) };

    case "points": {
      if (!farmer) return { reply: say(language, { tl: "Ang AgriPoints ay reward sa bawat order at rating. Mag-register muna: REG Pangalan, Barangay, Bayan.", bis: "Ang AgriPoints kay reward sa matag order ug rating. Pag-register una: REG Ngalan, Barangay, Lungsod.", en: "AgriPoints reward every order and rating. Register first: REG Name, Barangay, Town." }) };
      const p = getPoints(farmer.id);
      const next = p.next_tier ? say(language, { tl: ` ${p.next_tier.points_needed} pa para maging ${p.next_tier.name}.`, bis: ` ${p.next_tier.points_needed} pa aron mahimong ${p.next_tier.name}.`, en: ` ${p.next_tier.points_needed} more to reach ${p.next_tier.name}.` }) : "";
      return {
        reply:
          say(language, { tl: `May ${p.total} AgriPoints kayo (${p.tier}).`, bis: `Naa kay ${p.total} AgriPoints (${p.tier}).`, en: `You have ${p.total} AgriPoints (${p.tier}).` }) +
          next +
          say(language, { tl: "\nKumita: +2 bawat request, +10 bawat natapos na order, +5 sa pag-rate ng supplier.", bis: "\nKita: +2 matag request, +10 matag nahuman nga order, +5 sa pag-rate sa supplier.", en: "\nEarn: +2 per request, +10 per completed order, +5 for rating a supplier." }),
      };
    }

    case "registration_help":
      if (!farmer) return { reply: say(language, { tl: "Para mag-register, i-text: REG Pangalan, Barangay, Bayan\nhal. REG Juan Dela Cruz, Katipunan, M'lang", bis: "Aron mag-register, i-text: REG Ngalan, Barangay, Lungsod\npananglitan REG Juan Dela Cruz, Katipunan, M'lang", en: "To register, text: REG Name, Barangay, Town\ne.g. REG Juan Dela Cruz, Katipunan, M'lang" }) };
      return {
        reply: say(language, {
          tl: `Naka-register na kayo: ${farmer.name}, Brgy. ${farmer.barangay}, ${farmer.municipality}. Status: ${farmer.verification_status === "verified" ? "verified ✅" : "hinihintay ang verification ng barangay/kooperatiba"}. Para baguhin ang detalye, pumunta sa Settings ng AgriConnect app o makipag-ugnayan sa staff.`,
          bis: `Naka-register na ka: ${farmer.name}, Brgy. ${farmer.barangay}, ${farmer.municipality}. Status: ${farmer.verification_status === "verified" ? "verified ✅" : "naghulat sa verification sa barangay/kooperatiba"}. Aron usbon ang detalye, adto sa Settings sa AgriConnect app o kontaka ang staff.`,
          en: `You're registered: ${farmer.name}, Brgy. ${farmer.barangay}, ${farmer.municipality}. Status: ${farmer.verification_status === "verified" ? "verified ✅" : "waiting for barangay/cooperative verification"}. To change details, use Settings in the AgriConnect app or contact staff.`,
        }),
      };

    case "talk_to_human":
      return {
        reply: say(language, {
          tl: "Ipinasa na namin ang mensahe ninyo sa staff ng barangay/kooperatiba. Makikipag-ugnayan sila sa inyo sa lalong madaling panahon.",
          bis: "Gipasa na namo ang imong mensahe sa staff sa barangay/kooperatiba. Kontakon ka nila sa labing dali nga panahon.",
          en: "We've passed your message to the barangay/cooperative staff. They'll get in touch with you as soon as possible.",
        }),
        escalate: true,
      };

    case "complaint":
      return {
        reply: say(language, {
          tl: "Pasensya na po sa abala. Naitala namin ang reklamo ninyo at ipinasa sa staff para matulungan kayo. Kung may order number (hal. AC-2026-0001), i-text din po para mas mabilis.",
          bis: "Pasensya sa samok. Natala namo ang imong reklamo ug gipasa sa staff aron matabangan ka. Kung naa kay order number (pananglitan AC-2026-0001), i-text pud aron mas paspas.",
          en: "Sorry for the trouble. We've recorded your complaint and passed it to staff to help you. If you have an order number (e.g. AC-2026-0001), please text it too.",
        }),
        escalate: true,
      };

    default:
      return { reply: fallbackReply(language) };
  }
}

/** When the message isn't understood: say so and show what the bot can do. */
function fallbackReply(language) {
  return say(language, {
    tl: `Pasensya po, hindi ko ito naintindihan. Puwede ninyong:\n• Mag-order: ${ORDER_EXAMPLE.tl}\n• Magtanong ng presyo: "magkano ang urea?"\n• Tingnan ang order: STATUS\n• Humingi ng tulong sa staff: "staff po"`,
    bis: `Pasensya, wala nako kini masabti. Pwede ka:\n• Mo-order: ${ORDER_EXAMPLE.bis}\n• Mangutana sa presyo: "pila ang urea?"\n• Tan-awon ang order: STATUS\n• Mangayo og tabang sa staff: "staff palihug"`,
    en: `Sorry, I didn't understand that. You can:\n• Order: ${ORDER_EXAMPLE.en}\n• Ask a price: "how much is urea?"\n• Check your order: STATUS\n• Get help from staff: "talk to staff"`,
  });
}

// Intents the knowledge base answers; "order" and product price/availability
// questions stay with the order parser (it knows the product and quantity).
const KB_INTENTS = new Set([
  "greeting", "thanks", "acknowledge", "goodbye", "how_to_order", "delivery_area", "order_status", "cancel_order",
  "payment", "hours", "location", "about", "suppliers", "farming_advice", "points", "registration_help",
  "talk_to_human", "complaint", "price", "availability",
]);

module.exports = { answerIntent, fallbackReply, KB_INTENTS };
