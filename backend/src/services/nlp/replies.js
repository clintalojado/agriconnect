// Short, SMS-length replies in the farmer's own language. Used by the
// rule-based parser (the AI path writes its own), and by the SMS channel for
// fixed system messages.

const { replyLanguage } = require("./i18n");

function describeOrder({ product_name, quantity, unit }) {
  return [quantity, unit, product_name].filter((v) => v != null && v !== "").join(" ");
}

const TEMPLATES = {
  tagalog: {
    confirm: (o) =>
      `Salamat po! Natanggap namin ang request ninyo: ${describeOrder(o)}${
        o.preferred_date ? ` (kailangan ${o.preferred_date})` : ""
      }. Ipapaalam namin kapag may alok na ang supplier.`,
    ask: {
      product_name: "Anong produkto po ang kailangan ninyo? (hal. urea, 14-14-14, binhi ng mais)",
      quantity: "Ilang sako o kilo po ang kailangan ninyo?",
      unit: "Sako, kilo, o litro po ba?",
      barangay: "Saang barangay po kayo?",
    },
    inquiry: "Salamat po sa tanong. Titingnan namin ang presyo at stock at babalitaan namin kayo.",
    other: "Pasensya na po, hindi namin naintindihan. Halimbawa: \"10 sako urea, bago Mayo\".",
  },
  bisaya: {
    confirm: (o) =>
      `Salamat! Nadawat namo ang imong request: ${describeOrder(o)}${
        o.preferred_date ? ` (kinahanglan ${o.preferred_date})` : ""
      }. Pahibaw-on namo ka kung naa nay tanyag gikan sa supplier.`,
    ask: {
      product_name: "Unsa nga produkto ang imong kinahanglan? (pananglitan urea, 14-14-14, liso sa mais)",
      quantity: "Pila ka sako o kilo ang imong kinahanglan?",
      unit: "Sako, kilo, o litro ba?",
      barangay: "Asa nga barangay ka?",
    },
    inquiry: "Salamat sa pangutana. Susihon namo ang presyo ug stock ug pahibaw-on ka namo.",
    other: "Pasensya, wala namo masabti. Pananglitan: \"10 ka sako urea, sa dili pa Mayo\".",
  },
  hiligaynon: {
    confirm: (o) =>
      `Salamat! Nabaton namon ang inyo request: ${describeOrder(o)}${
        o.preferred_date ? ` (kinahanglan ${o.preferred_date})` : ""
      }. Pahibaluon namon kamo kon may tanyag na halin sa supplier.`,
    ask: {
      product_name: "Ano nga produkto ang kinahanglan mo? (pareho sang urea, 14-14-14, binhi sang mais)",
      quantity: "Pila ka sako ukon kilo ang kinahanglan mo?",
      unit: "Sako, kilo, ukon litro bala?",
      barangay: "Diin nga barangay kamo?",
    },
    inquiry: "Salamat sa pamangkot. Usisaon namon ang presyo kag stock kag pahibaluon namon kamo.",
    other: "Pasensya, wala namon naintiendihan. Pareho sang: \"10 ka sako urea, antes sang Mayo\".",
  },
  ilocano: {
    confirm: (o) =>
      `Agyamanak! Naawatmi ti requestyo: ${describeOrder(o)}${
        o.preferred_date ? ` (kasapulan ${o.preferred_date})` : ""
      }. Ipakaammomi kadakayo no adda ti idiaya ti supplier.`,
    ask: {
      product_name: "Ania a produkto ti kasapulam? (kas iti urea, 14-14-14, bukel ti mais)",
      quantity: "Mano a sako wenno kilo ti kasapulam?",
      unit: "Sako, kilo, wenno litro kadi?",
      barangay: "Ania a barangay ti ayanyo?",
    },
    inquiry: "Agyamanak iti saludsodyo. Kitaenmi ti presyo ken stock ket ipakaammomi kadakayo.",
    other: "Pakawan, saanmi a naawatan. Kas iti: \"10 a sako nga urea, sakbay ti Mayo\".",
  },
  english: {
    confirm: (o) =>
      `Thanks! We got your request: ${describeOrder(o)}${
        o.preferred_date ? ` (needed ${o.preferred_date})` : ""
      }. We'll let you know once a supplier sends an offer.`,
    ask: {
      product_name: "Which product do you need? (e.g. urea, 14-14-14, corn seeds)",
      quantity: "How many sacks or kilos do you need?",
      unit: "Is that in sacks, kilos, or liters?",
      barangay: "Which barangay are you in?",
    },
    inquiry: "Thanks for asking. We'll check prices and stock and get back to you.",
    other: "Sorry, we didn't understand that. Example: \"10 sacks urea before May\".",
  },
};

// Other languages, mixed, and unknown get Tagalog (see i18n.js).
function templatesFor(language) {
  return TEMPLATES[replyLanguage(language)] || TEMPLATES.tagalog;
}

function confirmationReply(language, order) {
  return templatesFor(language).confirm(order);
}

function clarificationQuestion(language, missingFields) {
  const ask = templatesFor(language).ask;
  // The quantity question already asks for the unit ("how many sacks or kilos").
  const fields = missingFields.includes("quantity") ? missingFields.filter((f) => f !== "unit") : missingFields;
  const questions = fields.map((field) => ask[field]).filter(Boolean);
  return questions.length ? questions.join(" ") : null;
}

function intentReply(language, intent) {
  const t = templatesFor(language);
  return intent === "inquiry" ? t.inquiry : t.other;
}

module.exports = { confirmationReply, clarificationQuestion, intentReply, describeOrder };
