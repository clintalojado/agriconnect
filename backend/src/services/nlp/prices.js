// Price answers for the SMS / Messenger bot: every verified store's price for
// a product, cheapest first, and whether the store delivers to the farmer's
// barangay. SMS gets it as text; Messenger also gets photo cards (store,
// price, rating, delivery) with Order and Call buttons.

const { getDb } = require("../../db/connection");
const { money, perUnit } = require("../../utils/format");
const { say } = require("./i18n");

// Product photos shipped with the frontend (frontend/public/images/products).
const PHOTOS = {
  "Urea (46-0-0)": "urea.jpg",
  "Complete fertilizer (14-14-14)": "complete-14-14-14.jpg",
  "Ammonium sulfate (21-0-0)": "ammonium-sulfate.jpg",
  "Ammophos (16-20-0)": "ammophos.jpg",
  "Muriate of potash (0-0-60)": "potash.jpg",
  "Organic fertilizer": "organic-fertilizer.jpg",
  "Rice seeds": "rice-seeds.jpg",
  "Hybrid corn seeds": "corn-seeds.jpg",
  Insecticide: "insecticide.jpg",
  Herbicide: "herbicide.jpg",
  Fungicide: "fungicide.jpg",
  "Hog grower feed": "hog-feed.jpg",
  "Chicken feed": "chicken-feed.jpg",
};

// Messenger postback payloads (handled in routes/messenger.routes.js).
const ORDER_PAYLOAD = "ORDER|";
const PRICES_PAYLOAD = "PRICES|";

// Messenger generic-template limits.
const MAX_CARDS = 10;
const MAX_TITLE = 80;
const MAX_SUBTITLE = 80;

/** Public site address, for photo links in Messenger cards (none when running locally). */
function publicUrl() {
  return (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/+$/, "");
}

function photoUrl(productName) {
  const base = publicUrl();
  const file = PHOTOS[productName];
  return base && file ? `${base}/images/products/${file}` : null;
}

// "Urea (46-0-0)" → "urea", "Complete fertilizer (14-14-14)" → "14-14-14": what a farmer would text.
function shortName(productName) {
  const grade = productName.match(/\((\d+-\d+-\d+)\)/)?.[1];
  if (grade && !/^urea/i.test(productName)) return grade;
  return productName.replace(/\s*\(.*\)/, "").toLowerCase();
}

function offersFor(productName) {
  return getDb()
    .prepare(
      `SELECT s.id AS supplier_id, s.name, s.barangay, s.municipality, s.phone, s.coverage_barangays,
              sp.price, sp.unit, sp.brand,
              (SELECT ROUND(AVG(rating), 1) FROM reviews r WHERE r.supplier_id = s.id) AS rating
       FROM supplier_products sp
       JOIN products p ON p.id = sp.product_id
       JOIN suppliers s ON s.id = sp.supplier_id
       WHERE p.name = ? AND sp.in_stock = 1 AND s.verified = 1
       ORDER BY sp.price ASC`
    )
    .all(productName);
}

function coverage(offer) {
  return (offer.coverage_barangays || "").split(",").map((b) => b.trim()).filter(Boolean);
}

function deliversTo(offer, barangay) {
  return Boolean(barangay) && coverage(offer).some((b) => b.toLowerCase() === barangay.toLowerCase());
}

// Who delivers, in a few words: to the farmer's barangay, pickup only, or (no
// barangay known) the first barangays the store covers. `sms` keeps to plain
// GSM characters: one emoji makes every SMS part hold 70 characters instead of 160.
function deliveryNote(offer, barangay, language, { sms = false } = {}) {
  const truck = sms ? "" : "🚚 ";
  const shop = sms ? "" : "🏪 ";
  const pickup = say(language, { tl: "pickup lang", bis: "pickup ra", hil: "pickup lang", ilo: "pickup laeng", en: "pickup only" });
  if (barangay) {
    return deliversTo(offer, barangay)
      ? truck +
          say(language, {
            tl: `naghahatid sa ${barangay}`,
            bis: `naghatod sa ${barangay}`,
            hil: `nagahatod sa ${barangay}`,
            ilo: `agitulod iti ${barangay}`,
            en: `delivers to ${barangay}`,
          })
      : shop + pickup;
  }
  const areas = coverage(offer);
  if (!areas.length) return shop + pickup;
  const label = say(language, { tl: "hatid", bis: "hatod", hil: "hatod", ilo: "itulod", en: "delivers" });
  return `${truck}${label}: ${areas.slice(0, 3).join(", ")}${areas.length > 3 ? (sms ? "..." : "…") : ""}`;
}

function place(offer) {
  return offer.barangay || offer.municipality || "";
}

function stars(offer, { sms = false } = {}) {
  if (!offer.rating) return "";
  return sms ? ` *${offer.rating}` : ` ★${offer.rating}`;
}

function orderButton(language, productName) {
  return {
    type: "postback",
    title: say(language, { tl: "Mag-order", bis: "Mo-order", hil: "Mag-order", ilo: "Agorder", en: "Order" }),
    payload: `${ORDER_PAYLOAD}${productName}`,
  };
}

function callButton(language, phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  const e164 = digits.startsWith("0") ? `+63${digits.slice(1)}` : `+${digits}`;
  return { type: "phone_number", title: say(language, { tl: "Tawagan", bis: "Tawagi", hil: "Tawgi", ilo: "Awagan", en: "Call" }), payload: e164 };
}

function card({ title, subtitle, image, buttons }) {
  return {
    title: title.slice(0, MAX_TITLE),
    subtitle: subtitle.slice(0, MAX_SUBTITLE),
    ...(image ? { image_url: image } : {}),
    buttons: buttons.filter(Boolean).slice(0, 3),
  };
}

/**
 * One product: every store's price, cheapest first.
 * Returns { reply (full text, for SMS/web), cards, cardsReply (short text sent with the cards) }.
 */
function productPrices(productName, { language, barangay = null, limit = 4 } = {}) {
  const offers = offersFor(productName);
  const short = shortName(productName);
  if (!offers.length) {
    return {
      reply: say(language, {
        tl: `Wala pang supplier na naglista ng ${productName}. I-text ang dami para humingi ng quote, hal. "5 sako ${short}".`,
        bis: `Wala pay supplier nga naglista sa ${productName}. I-text ang gidaghanon aron mangayo og quote, pananglitan "5 ka sako ${short}".`,
        hil: `Wala pa sang supplier nga naglista sang ${productName}. I-text ang kadamuon para mangayo sang quote, pareho sang "5 ka sako ${short}".`,
        ilo: `Awan pay ti supplier a nangilista iti ${productName}. I-text ti kaadu tapno agkiddaw iti quote, kas iti "5 a sako a ${short}".`,
        en: `No supplier lists ${productName} yet. Text the quantity to ask for quotations, e.g. "5 sacks ${short}".`,
      }),
      cards: [],
    };
  }

  const header = say(language, {
    tl: `Presyo ng ${productName} (pinakamura una):`,
    bis: `Presyo sa ${productName} (pinakabarato una):`,
    hil: `Presyo sang ${productName} (pinakabarato anay):`,
    ilo: `Presyo ti ${productName} (kalaklaka nga umuna):`,
    en: `${productName} prices (cheapest first):`,
  });
  const lines = offers.slice(0, limit).map((o, i) => {
    const price = `${money(o.price)}/${perUnit(o.unit)}`;
    return `${i + 1}) ${price} - ${o.name} (${place(o)})${stars(o, { sms: true })}, ${deliveryNote(o, barangay, language, { sms: true })}`;
  });
  const more = offers.length > limit ? `\n+${offers.length - limit}` : "";
  const howToOrder = say(language, {
    tl: `I-text ang dami para mag-order, hal. "5 sako ${short}".`,
    bis: `I-text ang gidaghanon aron mo-order, pananglitan "5 ka sako ${short}".`,
    hil: `I-text ang kadamuon para mag-order, pareho sang "5 ka sako ${short}".`,
    ilo: `I-text ti kaadu tapno agorder, kas iti "5 a sako a ${short}".`,
    en: `Text the quantity to order, e.g. "5 sacks ${short}".`,
  });

  const cards = offers.slice(0, MAX_CARDS).map((o) =>
    card({
      title: `${o.name} — ${money(o.price)}/${perUnit(o.unit)}`,
      subtitle: `${productName}${o.brand ? ` · ${o.brand}` : ""}\n📍 ${place(o)}${stars(o)} · ${deliveryNote(o, barangay, language)}`,
      image: photoUrl(productName),
      buttons: [orderButton(language, productName), callButton(language, o.phone)],
    })
  );
  const cardsReply = say(language, {
    tl: `Ito ang presyo ng ${productName} sa mga verified supplier 👇 I-tap ang Mag-order, o i-text ang dami (hal. "5 sako ${short}").`,
    bis: `Mao ni ang presyo sa ${productName} sa mga verified supplier 👇 I-tap ang Mo-order, o i-text ang gidaghanon (pananglitan "5 ka sako ${short}").`,
    hil: `Amo ini ang presyo sang ${productName} sa mga verified supplier 👇 I-tap ang Mag-order, ukon i-text ang kadamuon (pareho sang "5 ka sako ${short}").`,
    ilo: `Daytoy ti presyo ti ${productName} kadagiti verified supplier 👇 I-tap ti Agorder, wenno i-text ti kaadu (kas iti "5 a sako a ${short}").`,
    en: `Here are ${productName} prices from verified suppliers 👇 Tap Order, or text the quantity (e.g. "5 sacks ${short}").`,
  });

  return { reply: `${header}\n${lines.join("\n")}${more}\n${howToOrder}`, cards, cardsReply };
}

const MAIN_PRODUCTS = ["Urea (46-0-0)", "Complete fertilizer (14-14-14)", "Rice seeds", "Hybrid corn seeds", "Chicken feed"];

/** The price list: each product's lowest price and store. Same return shape as productPrices. */
function priceList({ language } = {}) {
  const products = getDb()
    .prepare(
      `SELECT DISTINCT p.name FROM products p
       JOIN supplier_products sp ON sp.product_id = p.id JOIN suppliers s ON s.id = sp.supplier_id
       WHERE sp.in_stock = 1 AND s.verified = 1`
    )
    .all()
    .map((r) => r.name)
    // Main products first, in a fixed order; then the rest.
    .sort((a, b) => (MAIN_PRODUCTS.indexOf(a) + 1 || 99) - (MAIN_PRODUCTS.indexOf(b) + 1 || 99));
  const cheapest = products.map((name) => ({ name, offer: offersFor(name)[0], stores: offersFor(name).length }));

  if (!cheapest.length) {
    return {
      reply: say(language, {
        tl: "Wala pang nakalistang presyo. I-text ang produkto at dami para humingi ng quote.",
        bis: "Wala pay presyo nga nakalista. I-text ang produkto ug gidaghanon aron mangayo og quote.",
        hil: "Wala pa sang presyo nga nakalista. I-text ang produkto kag kadamuon para mangayo sang quote.",
        ilo: "Awan pay ti nailista a presyo. I-text ti produkto ken kaadu tapno agkiddaw iti quote.",
        en: "No prices listed yet. Text the product and quantity to ask for quotations.",
      }),
      cards: [],
    };
  }

  const textItems = cheapest.filter((c) => MAIN_PRODUCTS.includes(c.name));
  const lines = (textItems.length ? textItems : cheapest.slice(0, 5)).map(
    ({ name, offer }) => `- ${name} ${money(offer.price)}/${perUnit(offer.unit)}, ${offer.name}`
  );
  const reply =
    say(language, {
      tl: "Pinakamababang presyo ngayon mula sa verified suppliers:",
      bis: "Pinakaubos nga presyo karon gikan sa verified suppliers:",
      hil: "Pinakamanubo nga presyo subong halin sa verified suppliers:",
      ilo: "Kalaklaka a presyo ita manipud kadagiti verified supplier:",
      en: "Lowest prices now from verified suppliers:",
    }) +
    `\n${lines.join("\n")}\n` +
    say(language, {
      tl: 'Para makita ang presyo ng bawat tindahan, i-text hal. "magkano ang urea?"',
      bis: 'Aron makita ang presyo sa matag tindahan, i-text pananglitan "pila ang urea?"',
      hil: 'Para makita ang presyo sang kada tindahan, i-text pareho sang "tagpila ang urea?"',
      ilo: 'Tapno makita ti presyo ti tunggal tienda, i-text kas iti "mano ti urea?"',
      en: 'To see every store\'s price, text e.g. "how much is urea?"',
    });

  const cards = cheapest.slice(0, MAX_CARDS).map(({ name, offer, stores }) =>
    card({
      title: `${name} — ${say(language, { tl: "mula", bis: "gikan", hil: "halin", ilo: "manipud", en: "from" })} ${money(offer.price)}/${perUnit(offer.unit)}`,
      subtitle: `${offer.name}${stars(offer)} · ${stores} ${say(language, { tl: "tindahan", bis: "tindahan", hil: "tindahan", ilo: "tienda", en: stores === 1 ? "store" : "stores" })}`,
      image: photoUrl(name),
      buttons: [
        {
          type: "postback",
          title: say(language, { tl: "Lahat ng presyo", bis: "Tanang presyo", hil: "Tanan nga presyo", ilo: "Amin a presyo", en: "All prices" }),
          payload: `${PRICES_PAYLOAD}${name}`,
        },
        orderButton(language, name),
      ],
    })
  );
  const cardsReply = say(language, {
    tl: "Ito ang pinakamababang presyo ngayon 👇 I-tap ang Lahat ng presyo para ikumpara ang mga tindahan.",
    bis: "Mao ni ang pinakaubos nga presyo karon 👇 I-tap ang Tanang presyo aron itandi ang mga tindahan.",
    hil: "Amo ini ang pinakamanubo nga presyo subong 👇 I-tap ang Tanan nga presyo para ikumparar ang mga tindahan.",
    ilo: "Daytoy ti kalaklaka a presyo ita 👇 I-tap ti Amin a presyo tapno idiligyo dagiti tienda.",
    en: "Here are today's lowest prices 👇 Tap All prices to compare stores.",
  });
  return { reply, cards, cardsReply };
}

module.exports = { productPrices, priceList, ORDER_PAYLOAD, PRICES_PAYLOAD };
