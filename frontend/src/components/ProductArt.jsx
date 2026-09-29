import { useState } from "react";
import { cx } from "./ui.jsx";

// Product thumbnails: a real photo when we have one, otherwise an
// illustration — a sack for fertilizer and feeds, a seed bag, a bottle for
// pesticides, with the product's grade or short name on the label.

const PALETTES = {
  fertilizer: { bg: "from-sky-50 to-sky-100", body: "#f8fafc", band: "#2a78d6", ink: "#184f95" },
  seeds: { bg: "from-harvest-50 to-harvest-100", body: "#fffbeb", band: "#d97706", ink: "#92400e" },
  pesticide: { bg: "from-brand-50 to-brand-100", body: "#ffffff", band: "#1f7a4f", ink: "#14412e" },
  feeds: { bg: "from-rose-50 to-rose-100", body: "#fff7ed", band: "#be123c", ink: "#881337" },
  tools: { bg: "from-stone-100 to-stone-200", body: "#fafaf9", band: "#57534e", ink: "#292524" },
};

// Squeezes long labels (e.g. "CHICKEN", "ORGANIC") to fit the label band.
function fit(label, maxWidth) {
  return label.length > 6 ? { textLength: maxWidth, lengthAdjust: "spacingAndGlyphs" } : {};
}

function labelFor(name = "", variant) {
  const grade = name.match(/\((\d+-\d+-\d+)\)/)?.[1];
  if (grade) return grade;
  if (variant && variant.length <= 10) return variant;
  return name.split(/[\s(]/)[0].slice(0, 9).toUpperCase();
}

function Sack({ p, label }) {
  return (
    <>
      <path d="M22 18c6-4 30-4 36 0l4 46c0 6-8 9-24 9S16 70 16 64l6-46Z" fill={p.body} stroke={p.ink} strokeOpacity=".25" />
      <path d="M22 18c6 3 30 3 36 0" fill="none" stroke={p.ink} strokeOpacity=".35" strokeWidth="2" />
      <rect x="21" y="36" width="38" height="18" rx="3" fill={p.band} />
      <text x="40" y="48.5" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#fff" fontFamily="system-ui" {...fit(label, 32)}>
        {label}
      </text>
      <path d="M28 62h24" stroke={p.ink} strokeOpacity=".2" strokeWidth="2" strokeLinecap="round" />
    </>
  );
}

function SeedBag({ p, label }) {
  return (
    <>
      <path d="M20 14h40l-2 56H22l-2-56Z" fill={p.body} stroke={p.ink} strokeOpacity=".25" />
      <path d="M20 14h40v6H20z" fill={p.band} />
      <g fill={p.band} opacity=".85">
        <ellipse cx="33" cy="34" rx="3" ry="5" transform="rotate(-20 33 34)" />
        <ellipse cx="41" cy="31" rx="3" ry="5" />
        <ellipse cx="49" cy="34" rx="3" ry="5" transform="rotate(20 49 34)" />
      </g>
      <path d="M41 36v12" stroke={p.ink} strokeWidth="1.5" />
      <text x="40" y="61" textAnchor="middle" fontSize="7.5" fontWeight="800" fill={p.ink} fontFamily="system-ui" {...fit(label, 32)}>
        {label}
      </text>
    </>
  );
}

function Bottle({ p, label }) {
  return (
    <>
      <rect x="33" y="8" width="14" height="8" rx="2" fill={p.band} />
      <path d="M31 16h18v6c6 3 9 7 9 12v32a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4V34c0-5 3-9 9-12v-6Z" fill={p.body} stroke={p.ink} strokeOpacity=".3" />
      <rect x="25" y="38" width="30" height="20" rx="3" fill={p.band} />
      <text x="40" y="51" textAnchor="middle" fontSize="7" fontWeight="800" fill="#fff" fontFamily="system-ui" {...fit(label, 26)}>
        {label}
      </text>
    </>
  );
}

// Real photos per catalog product (Wikimedia Commons, free licenses — see
// public/images/credits.json). Products not listed use the illustration.
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

export function productPhoto(name) {
  const file = PHOTOS[name];
  return file ? `/images/products/${file}` : null;
}

export default function ProductArt({ product, className }) {
  const name = product?.name || product?.product_name;
  const [failed, setFailed] = useState(false);
  const photo = !failed && productPhoto(name);
  const category = product?.category || "fertilizer";
  const p = PALETTES[category] || PALETTES.fertilizer;
  const label = labelFor(name, product?.variant);
  const Shape = category === "seeds" ? SeedBag : category === "pesticide" ? Bottle : Sack;

  if (photo) {
    return (
      <div className={cx("overflow-hidden bg-stone-100", className)}>
        <img
          src={photo}
          alt={name}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>
    );
  }

  return (
    <div className={cx("flex items-center justify-center overflow-hidden bg-gradient-to-br", p.bg, className)}>
      <svg viewBox="0 0 80 80" className="h-[78%] w-[78%] drop-shadow-sm" role="img" aria-label={product?.name || "Product"}>
        <Shape p={p} label={label} />
      </svg>
    </div>
  );
}
