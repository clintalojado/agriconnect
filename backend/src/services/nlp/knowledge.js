// Knowledge base: the bot's answer for each intent the classifier recognises
// (greetings, how to order, delivery areas, order status, payment, farming
// advice, …). Answers use live data where it exists — suppliers' delivery
// coverage, the farmer's requests, current prices, AgriPoints — and come in
// the farmer's language (Tagalog, Bisaya, Hiligaynon, Ilocano, or English;
// see i18n.js for the others).

const { getDb } = require("../../db/connection");
const { findBarangayInText, MUNICIPALITY } = require("../locations");
const { getPoints } = require("../points.service");
const { money, perUnit } = require("../../utils/format");
const { say } = require("./i18n");
const { canonicalProduct } = require("./lexicon");
const { productPrices, priceList } = require("./prices");

const ORDER_EXAMPLE = {
  tl: '"5 sako urea, sa Katipunan, sunod linggo"',
  bis: '"5 ka sako urea, sa Katipunan, sunod semana"',
  hil: '"5 ka sako urea, sa Katipunan, masunod nga semana"',
  ilo: '"5 a sako nga urea, idiay Katipunan, inton sumaruno a lawas"',
  en: '"5 sacks urea, Katipunan, next week"',
};

const PRICES_NOW = { tl: "Presyo ngayon", bis: "Presyo karon", hil: "Presyo subong", ilo: "Presyo ita", en: "Prices now" };

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
  const pest = /peste|ulod|uod|igges|insekto|insect|stem ?borer|leaf ?folder|kuto|tambal|gamot|bulong|agas|spray/.test(t);
  const disease = /blast|blight|fung|amag|sakit|balatian|lapok|naninilaw|dalag|dulaw|duyaw|yellow/.test(t);
  const weeds = /damo|weed|sagbot|hilamon|ruot|dikut|duot|herbicide/.test(t);
  const corn = /mais|corn/.test(t);
  const veg = /gulay|gule|vegetable|utanon|utan|nateng|kamatis|talong|pechay/.test(t);
  const footer = say(language, {
    tl: "\nPara sa eksaktong dami, magpa-soil test o magtanong sa Municipal Agriculture Office (MAO).",
    bis: "\nPara sa eksaktong gidaghanon, pa-soil test o pangutana sa Municipal Agriculture Office (MAO).",
    hil: "\nPara sa eksakto nga kadamuon, magpa-soil test ukon magpamangkot sa Municipal Agriculture Office (MAO).",
    ilo: "\nPara iti eksakto a kaadu, agpa-soil test wenno agdamag iti Municipal Agriculture Office (MAO).",
    en: "\nFor exact amounts, get a soil test or ask your Municipal Agriculture Office (MAO).",
  });
  const pricesLine = (names) => {
    const prices = names.map(priceTag).filter(Boolean);
    return prices.length ? `\n${say(language, PRICES_NOW)}: ${prices.join(", ")}` : "";
  };

  if (pest || disease || weeds) {
    const lines = [];
    if (pest) {
      lines.push(say(language, {
        tl: "• Insekto (stem borer, leaf folder, uod): Insecticide",
        bis: "• Insekto (stem borer, leaf folder, ulod): Insecticide",
        hil: "• Insekto (stem borer, leaf folder, ulod): Insecticide",
        ilo: "• Insekto (stem borer, leaf folder, igges): Insecticide",
        en: "• Insects (stem borer, leaf folder, worms): Insecticide",
      }));
    }
    if (disease) {
      lines.push(say(language, {
        tl: "• Sakit tulad ng blast o blight: Fungicide. Ang paninilaw ay puwede ring kulang sa nitrogen (Urea).",
        bis: "• Sakit sama sa blast o blight: Fungicide. Ang pagdalag pwede sab kulang sa nitrogen (Urea).",
        hil: "• Balatian pareho sang blast ukon blight: Fungicide. Ang pagdulaw sang dahon mahimo man nga kulang sa nitrogen (Urea).",
        ilo: "• Sakit a kas iti blast wenno blight: Fungicide. Ti panagduyaw ti bulong ket mabalin met a kurang iti nitrogen (Urea).",
        en: "• Diseases like blast or blight: Fungicide. Yellowing can also mean low nitrogen (Urea).",
      }));
    }
    if (weeds) {
      lines.push(say(language, {
        tl: "• Damo: Herbicide (pre- o post-emergence)",
        bis: "• Sagbot: Herbicide (pre- o post-emergence)",
        hil: "• Hilamon: Herbicide (pre- ukon post-emergence)",
        ilo: "• Ruot: Herbicide (pre- wenno post-emergence)",
        en: "• Weeds: Herbicide (pre- or post-emergence)",
      }));
    }
    return (
      say(language, { tl: "Karaniwang gamit:", bis: "Kasagarang gamit:", hil: "Kasagaran nga ginagamit:", ilo: "Kadawyan nga usaren:", en: "Commonly used:" }) +
      `\n${lines.join("\n")}\n` +
      say(language, {
        tl: "Basahin ang label, sundin ang tamang dosis, at magsuot ng proteksyon sa pag-spray.",
        bis: "Basaha ang label, sunda ang saktong dosis, ug pagsul-ob og proteksyon sa pag-spray.",
        hil: "Basaha ang label, sunda ang husto nga dosis, kag magsuksok sang proteksyon sa pag-spray.",
        ilo: "Basaem ti label, suroten ti husto a dosis, ken agusar iti proteksion no agispray.",
        en: "Read the label, follow the dose, and wear protection when spraying.",
      }) +
      pricesLine(["Insecticide", "Fungicide", "Herbicide"]) +
      footer
    );
  }

  if (corn) {
    return (
      say(language, {
        tl: "Sa mais, karaniwan: Complete (14-14-14) sa pagtanim, tapos Urea bilang side-dress mga 25–30 araw pagkatanim.",
        bis: "Sa mais, kasagaran: Complete (14-14-14) sa pagtanom, dayon Urea isip side-dress mga 25–30 ka adlaw human sa pagtanom.",
        hil: "Sa mais, kasagaran: Complete (14-14-14) sa pagtanom, dayon Urea bilang side-dress mga 25–30 ka adlaw pagkatapos sang pagtanom.",
        ilo: "Iti mais, kadawyan: Complete (14-14-14) iti panagmula, kalpasanna Urea a kas side-dress agarup 25–30 nga aldaw kalpasan ti panagmula.",
        en: "For corn, typically: Complete (14-14-14) at planting, then Urea as side-dress about 25–30 days after planting.",
      }) +
      pricesLine(["Complete fertilizer (14-14-14)", "Urea (46-0-0)", "Hybrid corn seeds"]) +
      footer
    );
  }

  if (veg) {
    return (
      say(language, {
        tl: "Sa gulay, maganda ang Organic fertilizer (compost/vermicast) sa paghahanda ng lupa, dagdagan ng Complete (14-14-14) kung kailangan.",
        bis: "Sa utanon, maayo ang Organic fertilizer (compost/vermicast) sa pag-andam sa yuta, dugangi og Complete (14-14-14) kon kinahanglan.",
        hil: "Sa utan, maayo ang Organic fertilizer (compost/vermicast) sa paghanda sang duta, dugangan sang Complete (14-14-14) kon kinahanglan.",
        ilo: "Iti nateng, nasayaat ti Organic fertilizer (compost/vermicast) iti panangisagana ti daga, nayonan iti Complete (14-14-14) no kasapulan.",
        en: "For vegetables, Organic fertilizer (compost/vermicast) when preparing the soil, plus Complete (14-14-14) if needed.",
      }) + footer
    );
  }

  // Default: rice (palay/humay), the main crop in M'lang.
  return (
    say(language, {
      tl: "Sa palay, karaniwan: Complete (14-14-14) bilang basal bago o sa pagtanim; Urea bilang top-dress sa tillering at panicle initiation; Potash (0-0-60) para sa pagpuno ng butil.",
      bis: "Sa humay, kasagaran: Complete (14-14-14) isip basal sa wala pa o sa pagtanom; Urea isip top-dress sa tillering ug panicle initiation; Potash (0-0-60) para sa pagpuno sa lugas.",
      hil: "Sa humay, kasagaran: Complete (14-14-14) bilang basal antes ukon sa pagtanom; Urea bilang top-dress sa tillering kag panicle initiation; Potash (0-0-60) para mapuno ang mga lugas sang humay.",
      ilo: "Iti pagay, kadawyan: Complete (14-14-14) a kas basal sakbay wenno iti panagmula; Urea a kas top-dress iti tillering ken panicle initiation; Potash (0-0-60) tapno napno dagiti bukel.",
      en: "For rice, typically: Complete (14-14-14) as basal before or at planting; Urea as top-dress at tillering and panicle initiation; Potash (0-0-60) for grain filling.",
    }) +
    pricesLine(["Complete fertilizer (14-14-14)", "Urea (46-0-0)", "Muriate of potash (0-0-60)"]) +
    footer
  );
}

// ---------- Answers per intent ----------

/**
 * @param intent   classifier intent
 * @param context  { text, language, farmer (row or null), statusReply(farmer, language) }
 * @returns { reply, escalate?, cards?, cardsReply? } — escalate=true when staff
 *   should follow up; cards (Messenger photo cards) are sent with cardsReply
 *   instead of reply on Messenger.
 */
function answerIntent(intent, { text, language, farmer, statusReply }) {
  const name = farmer?.name?.split(" ")[0];
  const comma = name ? `, ${name}` : "";
  const ex = ORDER_EXAMPLE;

  switch (intent) {
    case "greeting":
      return {
        reply: say(language, {
          tl: `Magandang araw${comma}! Ako ang AgriConnect bot 🌾 Puwede kayong mag-order ng abono, binhi, gamot, at feeds dito. I-text lang ang kailangan, hal. ${ex.tl}. O itanong ang presyo, delivery, o STATUS ng order.`,
          bis: `Maayong adlaw${comma}! Ako ang AgriConnect bot 🌾 Pwede mo mo-order og abono, liso, tambal, ug feeds diri. I-text lang ang kinahanglan, pananglitan ${ex.bis}. O pangutana sa presyo, delivery, o STATUS sa order.`,
          hil: `Maayong adlaw${comma}! Ako ang AgriConnect bot 🌾 Pwede kamo mag-order sang abono, binhi, bulong, kag feeds diri. I-text lang ang kinahanglan, pareho sang ${ex.hil}. Ukon pamangkot sa presyo, delivery, ukon STATUS sang order.`,
          ilo: `Naimbag nga aldaw${comma}! Siak ti AgriConnect bot 🌾 Mabalin ti agorder iti abono, bukel, agas, ken feeds ditoy. I-text laeng ti kasapulan, kas iti ${ex.ilo}. Wenno agdamag iti presyo, delivery, wenno STATUS ti order.`,
          en: `Hello${comma}! I'm the AgriConnect bot 🌾 You can order fertilizer, seeds, pesticides, and feeds here. Just text what you need, e.g. ${ex.en}. Or ask about prices, delivery, or your order STATUS.`,
        }),
      };
    case "thanks":
      return {
        reply: say(language, {
          tl: "Walang anuman po! Nandito lang kami kung may kailangan pa kayo. 🌾",
          bis: "Walay sapayan! Ania ra mi kung naa pa kay kinahanglan. 🌾",
          hil: "Wala sang anuman! Ari lang kami kon may kinahanglan pa kamo. 🌾",
          ilo: "Awan ti anaman! Adda kami laeng ditoy no adda pay kasapulanyo. 🌾",
          en: "You're welcome! We're here whenever you need farm inputs. 🌾",
        }),
      };
    case "acknowledge":
      return {
        reply: say(language, {
          tl: `Sige po! I-text lang kung may order kayo, hal. ${ex.tl}.`,
          bis: `Sige! I-text lang kung naa kay order, pananglitan ${ex.bis}.`,
          hil: `Sige! I-text lang kon may order kamo, pareho sang ${ex.hil}.`,
          ilo: `Sige! I-text laeng no adda orderyo, kas iti ${ex.ilo}.`,
          en: `Okay! Text us anytime to order, e.g. ${ex.en}.`,
        }),
      };
    case "goodbye":
      return {
        reply: say(language, {
          tl: "Paalam po, ingat! Mag-text lang ulit kung may kailangan. 🌾",
          bis: "Babay, amping! Text lang usab kung naa kay kinahanglan. 🌾",
          hil: "Halong kamo! Mag-text lang liwat kon may kinahanglan. 🌾",
          ilo: "Agannad kayo! Mag-text manen no adda kasapulanyo. 🌾",
          en: "Goodbye, take care! Message us again anytime. 🌾",
        }),
      };

    case "how_to_order":
      return {
        reply: say(language, {
          tl: `Madali lang po:\n1) I-text ang produkto, dami, at lugar — hal. ${ex.tl}\n2) Ipapakita namin ang nabasa namin; i-reply ang OO para i-confirm.\n3) Magpapadala ng quote ang mga verified supplier; piliin ang gusto ninyo.\n4) Ide-deliver sa barangay ninyo. I-text ang STATUS para makita ang order.`,
          bis: `Sayon ra:\n1) I-text ang produkto, gidaghanon, ug lugar — pananglitan ${ex.bis}\n2) Ipakita namo ang among nabasa; i-reply ang OO aron i-confirm.\n3) Mopadala og quote ang mga verified supplier; pilia ang gusto nimo.\n4) Ihatod sa inyong barangay. I-text ang STATUS aron makita ang order.`,
          hil: `Mahapos lang:\n1) I-text ang produkto, kadamuon, kag lugar — pareho sang ${ex.hil}\n2) Ipakita namon ang amon nabasa; i-reply ang OO para i-confirm.\n3) Magapadala sang quote ang mga verified supplier; pilia ang gusto mo.\n4) Ihatod sa inyo barangay. I-text ang STATUS para makita ang order.`,
          ilo: `Nalaka laeng:\n1) I-text ti produkto, kaadu, ken lugar — kas iti ${ex.ilo}\n2) Ipakitami ti naawatanmi; i-reply ti WEN tapno ma-confirm.\n3) Agpatulod dagiti verified supplier iti quote; piliem ti kayatmo.\n4) Maitulod iti barangayyo. I-text ti STATUS tapno makita ti order.`,
          en: `It's easy:\n1) Text the product, quantity, and place — e.g. ${ex.en}\n2) We show what we understood; reply YES to confirm.\n3) Verified suppliers send quotations; choose the one you like.\n4) It's delivered to your barangay. Text STATUS to check your order.`,
        }),
      };

    case "price": {
      // A product named → every store's price; otherwise the price list.
      const product = canonicalProduct(text);
      if (product) return productPrices(product.name, { language, barangay: farmer?.barangay });
      return priceList({ language });
    }

    case "availability":
      if (canonicalProduct(text)) return productPrices(canonicalProduct(text).name, { language, barangay: farmer?.barangay });
      return {
        reply: say(language, {
          tl: 'Aling produkto po? I-text ang pangalan, hal. "may urea ba?" o "magkano ang 14-14-14?"',
          bis: 'Unsang produkto? I-text ang ngalan, pananglitan "naa bay urea?" o "pila ang 14-14-14?"',
          hil: 'Ano nga produkto? I-text ang ngalan, pareho sang "may urea bala?" ukon "tagpila ang 14-14-14?"',
          ilo: 'Ania a produkto? I-text ti nagan, kas iti "adda kadi urea?" wenno "mano ti 14-14-14?"',
          en: 'Which product? Text its name, e.g. "is urea available?" or "how much is 14-14-14?"',
        }),
      };

    case "delivery_area": {
      const barangay = findBarangayInText(text) || null;
      const suppliers = verifiedSuppliers();
      const feeNote = say(language, {
        tl: "Ang delivery fee ay nakasulat sa bawat quote. Puwede ring pickup.",
        bis: "Ang delivery fee nakasulat sa matag quote. Pwede pud pickup.",
        hil: "Ang delivery fee nakasulat sa kada quote. Pwede man pickup.",
        ilo: "Ti delivery fee ket naisurat iti tunggal quote. Mabalin met ti pickup.",
        en: "The delivery fee is shown on each quotation. Pickup is also possible.",
      });
      if (barangay) {
        const covering = suppliers.filter((s) => (s.coverage_barangays || "").toLowerCase().includes(barangay.toLowerCase()));
        if (covering.length) {
          return {
            reply:
              say(language, {
                tl: `Oo po! Nagde-deliver sa Brgy. ${barangay}:`,
                bis: `Oo! Naghatod sa Brgy. ${barangay}:`,
                hil: `Huo! Nagahatod sa Brgy. ${barangay}:`,
                ilo: `Wen! Agipatulod iti Brgy. ${barangay}:`,
                en: `Yes! These suppliers deliver to Brgy. ${barangay}:`,
              }) +
              `\n• ${covering.map((s) => s.name).join("\n• ")}\n` +
              feeNote,
          };
        }
        return {
          reply: say(language, {
            tl: `Wala pang supplier na naka-set mag-deliver sa Brgy. ${barangay}, pero puwede pa rin kayong mag-order — makikita ng mga supplier ang request at puwede silang mag-alok ng delivery o pickup.`,
            bis: `Wala pay supplier nga naka-set maghatod sa Brgy. ${barangay}, pero pwede gihapon mo mo-order — makita sa mga supplier ang request ug pwede sila mohalad og delivery o pickup.`,
            hil: `Wala pa sang supplier nga naka-set maghatod sa Brgy. ${barangay}, pero pwede gihapon kamo mag-order — makita sang mga supplier ang request kag pwede sila magtanyag sang delivery ukon pickup.`,
            ilo: `Awan pay ti supplier a naka-set nga agipatulod iti Brgy. ${barangay}, ngem mabalin latta ti agorder — makita dagiti supplier ti request ket mabalin nga idiayada ti delivery wenno pickup.`,
            en: `No supplier lists Brgy. ${barangay} in their delivery area yet, but you can still order — suppliers see the request and can offer delivery or pickup.`,
          }),
        };
      }
      const areas = [...new Set(suppliers.flatMap((s) => (s.coverage_barangays || "").split(",").map((b) => b.trim()).filter(Boolean)))];
      return {
        reply:
          say(language, {
            tl: "Oo po, may delivery sa barangay ninyo! Nagde-deliver ngayon ang mga supplier sa:",
            bis: "Oo, naay delivery sa inyong barangay! Karon naghatod ang mga supplier sa:",
            hil: "Huo, may delivery sa inyo barangay! Subong nagahatod ang mga supplier sa:",
            ilo: "Wen, adda delivery iti barangayyo! Agipatpatulod dagiti supplier ita iti:",
            en: "Yes, suppliers deliver to your barangay! Current delivery areas:",
          }) +
          ` ${areas.join(", ") || MUNICIPALITY}.\n` +
          say(language, {
            tl: "Aling barangay po kayo? Ang delivery fee ay nasa bawat quote.",
            bis: "Asa kang barangay? Ang delivery fee naa sa matag quote.",
            hil: "Diin nga barangay kamo? Ang delivery fee ara sa kada quote.",
            ilo: "Ania a barangay ti ayanyo? Ti delivery fee ket adda iti tunggal quote.",
            en: "Which barangay are you in? The delivery fee is shown on each quotation.",
          }),
      };
    }

    case "order_status":
      if (!farmer) {
        return {
          reply: say(language, {
            tl: "Wala pa kayong order dahil hindi pa kayo naka-register. I-text ang REG Pangalan, Barangay, Bayan para magsimula.",
            bis: "Wala pa kay order kay wala pa ka naka-register. I-text ang REG Ngalan, Barangay, Lungsod aron magsugod.",
            hil: "Wala pa kamo order kay wala pa kamo naka-register. I-text ang REG Ngalan, Barangay, Banwa para magsugod.",
            ilo: "Awan pay ti orderyo ta saan pay kayo a nakarehistro. I-text ti REG Nagan, Barangay, Ili tapno mangrugi.",
            en: "You have no orders yet because you're not registered. Text REG Name, Barangay, Town to start.",
          }),
        };
      }
      return { reply: statusReply(farmer, language) };

    case "cancel_order":
      return {
        reply: say(language, {
          tl: "Para kanselahin: kung hinihintay pa ang OO, i-reply lang ang MALI. Kung may order na, puwede itong i-cancel sa AgriConnect app (Orders) habang hindi pa ide-deliver. Ipinaalam din namin sa staff ang mensahe ninyo.",
          bis: "Aron i-cancel: kung naghulat pa sa OO, i-reply lang ang MALI. Kung naa nay order, pwede kini i-cancel sa AgriConnect app (Orders) samtang wala pa ihatod. Gipahibalo usab namo ang staff.",
          hil: "Para i-cancel: kon ginahulat pa ang OO, i-reply lang ang INDI. Kon may order na, pwede ini i-cancel sa AgriConnect app (Orders) samtang wala pa ini ginahatod. Ginpahibalo man namon ang staff.",
          ilo: "Tapno ma-cancel: no ur-urayenmi pay ti WEN, i-reply laeng ti SAAN. No adda orderyon, mabalin daytoy nga i-cancel iti AgriConnect app (Orders) sakbay a maitulod. Impakaammomi met iti staff.",
          en: "To cancel: if we're still waiting for your YES, just reply NO. If an order was already placed, cancel it in the AgriConnect app (Orders) before it's out for delivery. We've also told the staff.",
        }),
        escalate: true,
      };

    case "payment":
      return {
        reply: say(language, {
          tl: "Libre ang paggamit ng AgriConnect. Ang bayad sa produkto ay diretso sa supplier — karaniwan cash on delivery o sa pickup; ang ibang paraan (hal. GCash) ay depende sa supplier. Puwede ninyo itong pag-usapan sa chat bago tanggapin ang quote.",
          bis: "Libre ang paggamit sa AgriConnect. Ang bayad sa produkto diretso sa supplier — kasagaran cash on delivery o sa pickup; ang uban nga paagi (sama sa GCash) depende sa supplier. Pwede ninyo kini hisgutan sa chat sa dili pa dawaton ang quote.",
          hil: "Libre ang paggamit sang AgriConnect. Ang bayad sa produkto diretso sa supplier — kasagaran cash on delivery ukon sa pickup; ang iban nga paagi (pareho sang GCash) depende sa supplier. Pwede ninyo ini istoryahan sa chat antes batunon ang quote.",
          ilo: "Libre ti panagusar iti AgriConnect. Ti bayad iti produkto ket diretso iti supplier — kadawyan a cash on delivery wenno iti pickup; ti sabali a wagas (kas iti GCash) ket agdepende iti supplier. Mabalin a pagsasaritaanyo daytoy iti chat sakbay nga awaten ti quote.",
          en: "AgriConnect is free to use. You pay the supplier directly — usually cash on delivery or at pickup; other methods (e.g. GCash) depend on the supplier. You can agree on it in chat before accepting a quotation.",
        }),
      };

    case "hours":
      return {
        reply: say(language, {
          tl: "Bukas ang AgriConnect 24/7 dito sa Messenger at SMS — puwede kayong mag-order anumang oras. Ang mga supplier ay sumasagot sa oras ng kanilang tindahan.",
          bis: "Abli ang AgriConnect 24/7 diri sa Messenger ug SMS — pwede mo mo-order bisan unsang orasa. Ang mga supplier motubag sa oras sa ilang tindahan.",
          hil: "Bukas ang AgriConnect 24/7 diri sa Messenger kag SMS — pwede kamo mag-order bisan ano nga oras. Ang mga supplier nagasabat sa oras sang ila tindahan.",
          ilo: "Nakalukat ti AgriConnect 24/7 ditoy Messenger ken SMS — mabalin ti agorder iti aniaman nga oras. Sumungbat dagiti supplier iti oras ti tiendada.",
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
            hil: `Online ang AgriConnect para sa mga barangay sang ${MUNICIPALITY}, Cotabato — indi na kinahanglan magkadto sa banwa. Mga verified supplier nga pwede pagkuhaan:`,
            ilo: `Online ti AgriConnect para kadagiti barangay ti ${MUNICIPALITY}, Cotabato — saanen a kasapulan ti mapan iti ili. Dagiti verified supplier a mabalin a pangalaan:`,
            en: `AgriConnect is online, serving the barangays of ${MUNICIPALITY}, Cotabato — no need to travel to town. Verified suppliers for pickup:`,
          }) + (list.length ? `\n• ${list.join("\n• ")}` : ""),
      };
    }

    case "about":
      return {
        reply: say(language, {
          tl: "Ang AgriConnect ay nag-uugnay sa mga magsasaka at verified na agri-supplier. Mag-text ng order sa sariling wika (Tagalog, Bisaya, Hiligaynon, Ilocano, English, at iba pa), ikumpara ang mga quote, at ipa-deliver sa barangay. Ako ang automated bot; ang staff ng barangay/kooperatiba ang nagbe-verify at tumutulong.",
          bis: "Ang AgriConnect nagkonektar sa mga mag-uuma ug verified nga agri-supplier. I-text ang order sa kaugalingong pinulongan (Bisaya, Tagalog, Hiligaynon, Ilocano, English, ug uban pa), itandi ang mga quote, ug ipahatod sa barangay. Ako ang automated bot; ang staff sa barangay/kooperatiba ang nag-verify ug motabang.",
          hil: "Ang AgriConnect nagakonektar sa mga mangunguma kag verified nga agri-supplier. I-text ang order sa kaugalingon mo nga hambal (Hiligaynon, Bisaya, Tagalog, Ilocano, English, kag iban pa), ikumparar ang mga quote, kag ipahatod sa barangay. Ako ang automated bot; ang staff sang barangay/kooperatiba ang nagaverify kag nagabulig.",
          ilo: "Ti AgriConnect ket mangikonekta kadagiti mannalon ken verified nga agri-supplier. I-text ti order iti bukodmo a pagsasao (Ilocano, Tagalog, Bisaya, Hiligaynon, English, ken dadduma pay), idilig dagiti quote, ken ipatulod iti barangay. Siak ti automated bot; ti staff ti barangay/kooperatiba ti mangverify ken tumulong.",
          en: "AgriConnect connects farmers with verified agri-input suppliers. Text your order in your own language (Tagalog, Bisaya, Hiligaynon, Ilocano, English, and more), compare quotations, and get it delivered to your barangay. I'm the automated bot; barangay/cooperative staff verify accounts and help out.",
        }),
      };

    case "suppliers": {
      const list = verifiedSuppliers().map((s) => `${s.name}${s.rating ? ` ★${s.rating}` : ""}`);
      return {
        reply:
          say(language, {
            tl: "Mga verified supplier sa AgriConnect:",
            bis: "Mga verified supplier sa AgriConnect:",
            hil: "Mga verified supplier sa AgriConnect:",
            ilo: "Dagiti verified supplier iti AgriConnect:",
            en: "Verified suppliers on AgriConnect:",
          }) +
          `\n• ${list.join("\n• ") || "—"}\n` +
          say(language, {
            tl: "Kapag nag-order kayo, sila mismo ang magpapadala ng quote para maikumpara ninyo.",
            bis: "Kung mo-order mo, sila mismo ang mopadala og quote aron inyong itandi.",
            hil: "Kon mag-order kamo, sila mismo ang magapadala sang quote para makumparar ninyo.",
            ilo: "No agorderkayo, isuda a mismo ti agpatulod iti quote tapno maidiligyo.",
            en: "When you order, they send quotations so you can compare.",
          }),
      };
    }

    case "farming_advice":
      return { reply: farmingAdvice(text, language) };

    case "points": {
      if (!farmer) {
        return {
          reply: say(language, {
            tl: "Ang AgriPoints ay reward sa bawat order at rating. Mag-register muna: REG Pangalan, Barangay, Bayan.",
            bis: "Ang AgriPoints kay reward sa matag order ug rating. Pag-register una: REG Ngalan, Barangay, Lungsod.",
            hil: "Ang AgriPoints amo ang premyo sa kada order kag rating. Magparehistro anay: REG Ngalan, Barangay, Banwa.",
            ilo: "Ti AgriPoints ket premio iti tunggal order ken rating. Agparehistro pay: REG Nagan, Barangay, Ili.",
            en: "AgriPoints reward every order and rating. Register first: REG Name, Barangay, Town.",
          }),
        };
      }
      const p = getPoints(farmer.id);
      const n = p.next_tier?.points_needed;
      const tier = p.next_tier?.name;
      const next = p.next_tier
        ? say(language, {
            tl: ` ${n} pa para maging ${tier}.`,
            bis: ` ${n} pa aron mahimong ${tier}.`,
            hil: ` ${n} pa para mangin ${tier}.`,
            ilo: ` ${n} pay tapno agbalin a ${tier}.`,
            en: ` ${n} more to reach ${tier}.`,
          })
        : "";
      return {
        reply:
          say(language, {
            tl: `May ${p.total} AgriPoints kayo (${p.tier}).`,
            bis: `Naa kay ${p.total} AgriPoints (${p.tier}).`,
            hil: `May ${p.total} AgriPoints kamo (${p.tier}).`,
            ilo: `Adda ${p.total} nga AgriPointsyo (${p.tier}).`,
            en: `You have ${p.total} AgriPoints (${p.tier}).`,
          }) +
          next +
          say(language, {
            tl: "\nKumita: +2 bawat request, +10 bawat natapos na order, +5 sa pag-rate ng supplier.",
            bis: "\nKita: +2 matag request, +10 matag nahuman nga order, +5 sa pag-rate sa supplier.",
            hil: "\nKita: +2 kada request, +10 kada natapos nga order, +5 sa pag-rate sang supplier.",
            ilo: "\nGanansia: +2 iti tunggal request, +10 iti tunggal nalpas nga order, +5 iti panag-rate iti supplier.",
            en: "\nEarn: +2 per request, +10 per completed order, +5 for rating a supplier.",
          }),
      };
    }

    case "registration_help": {
      if (!farmer) {
        return {
          reply: say(language, {
            tl: "Para mag-register, i-text: REG Pangalan, Barangay, Bayan\nhal. REG Juan Dela Cruz, Katipunan, M'lang",
            bis: "Aron mag-register, i-text: REG Ngalan, Barangay, Lungsod\npananglitan REG Juan Dela Cruz, Katipunan, M'lang",
            hil: "Para magparehistro, i-text: REG Ngalan, Barangay, Banwa\npareho sang REG Juan Dela Cruz, Katipunan, M'lang",
            ilo: "Tapno agparehistro, i-text: REG Nagan, Barangay, Ili\nkas iti REG Juan Dela Cruz, Katipunan, M'lang",
            en: "To register, text: REG Name, Barangay, Town\ne.g. REG Juan Dela Cruz, Katipunan, M'lang",
          }),
        };
      }
      const who = `${farmer.name}, Brgy. ${farmer.barangay}, ${farmer.municipality}`;
      const verified = farmer.verification_status === "verified";
      return {
        reply: say(language, {
          tl: `Naka-register na kayo: ${who}. Status: ${verified ? "verified ✅" : "hinihintay ang verification ng barangay/kooperatiba"}. Para baguhin ang detalye, pumunta sa Settings ng AgriConnect app o makipag-ugnayan sa staff.`,
          bis: `Naka-register na ka: ${who}. Status: ${verified ? "verified ✅" : "naghulat sa verification sa barangay/kooperatiba"}. Aron usbon ang detalye, adto sa Settings sa AgriConnect app o kontaka ang staff.`,
          hil: `Naka-register na kamo: ${who}. Status: ${verified ? "verified ✅" : "ginahulat ang verification sang barangay/kooperatiba"}. Para ilisan ang detalye, kadto sa Settings sang AgriConnect app ukon kontaka ang staff.`,
          ilo: `Nakarehistro kayon: ${who}. Status: ${verified ? "verified ✅" : "ur-urayen ti verification ti barangay/kooperatiba"}. Tapno baliwan ti detalye, mapan iti Settings ti AgriConnect app wenno kontaken ti staff.`,
          en: `You're registered: ${who}. Status: ${verified ? "verified ✅" : "waiting for barangay/cooperative verification"}. To change details, use Settings in the AgriConnect app or contact staff.`,
        }),
      };
    }

    case "talk_to_human":
      return {
        reply: say(language, {
          tl: "Ipinasa na namin ang mensahe ninyo sa staff ng barangay/kooperatiba. Makikipag-ugnayan sila sa inyo sa lalong madaling panahon.",
          bis: "Gipasa na namo ang imong mensahe sa staff sa barangay/kooperatiba. Kontakon ka nila sa labing dali nga panahon.",
          hil: "Ginpasa na namon ang inyo mensahe sa staff sang barangay/kooperatiba. Kontakon nila kamo sa labing madali nga panahon.",
          ilo: "Impasamin ti mensaheyo iti staff ti barangay/kooperatiba. Kontakendakayo iti kasapaan a panawen.",
          en: "We've passed your message to the barangay/cooperative staff. They'll get in touch with you as soon as possible.",
        }),
        escalate: true,
      };

    case "complaint":
      return {
        reply: say(language, {
          tl: "Pasensya na po sa abala. Naitala namin ang reklamo ninyo at ipinasa sa staff para matulungan kayo. Kung may order number (hal. AC-2026-0001), i-text din po para mas mabilis.",
          bis: "Pasensya sa samok. Natala namo ang imong reklamo ug gipasa sa staff aron matabangan ka. Kung naa kay order number (pananglitan AC-2026-0001), i-text pud aron mas paspas.",
          hil: "Pasensya gid sa kagamo. Natala namon ang inyo reklamo kag ginpasa sa staff para mabuligan kamo. Kon may order number kamo (pareho sang AC-2026-0001), i-text man para mas madasig.",
          ilo: "Pakawanendakami iti riribuk. Nailistami ti reklamoyo ket impasami iti staff tapno matulonganda kayo. No adda order numberyo (kas iti AC-2026-0001), i-text met tapno napardas.",
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
  const ex = ORDER_EXAMPLE;
  return say(language, {
    tl: `Pasensya po, hindi ko ito naintindihan. Puwede ninyong:\n• Mag-order: ${ex.tl}\n• Magtanong ng presyo: "magkano ang urea?"\n• Tingnan ang order: STATUS\n• Humingi ng tulong sa staff: "staff po"`,
    bis: `Pasensya, wala nako kini masabti. Pwede ka:\n• Mo-order: ${ex.bis}\n• Mangutana sa presyo: "pila ang urea?"\n• Tan-awon ang order: STATUS\n• Mangayo og tabang sa staff: "staff palihug"`,
    hil: `Pasensya, wala ko ini naintiendihan. Pwede kamo:\n• Mag-order: ${ex.hil}\n• Mamangkot sang presyo: "tagpila ang urea?"\n• Tan-awon ang order: STATUS\n• Mangayo sang bulig sa staff: "staff palihog"`,
    ilo: `Pakawan, saanko a naawatan daytoy. Mabalinyo ti:\n• Agorder: ${ex.ilo}\n• Agdamag iti presyo: "mano ti urea?"\n• Kitaen ti order: STATUS\n• Agkiddaw iti tulong iti staff: "staff man"`,
    en: `Sorry, I didn't understand that. You can:\n• Order: ${ex.en}\n• Ask a price: "how much is urea?"\n• Check your order: STATUS\n• Get help from staff: "talk to staff"`,
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
