import { useEffect, useState } from "react";
import { BASE_URL, apiClient } from "../api/client";
import { navigate } from "../lib/router";
import { setActiveRole, useSession } from "../lib/session";
import ProcessFlow from "../components/ProcessFlow.jsx";
import { Reveal, prefersReducedMotion, useCountUp, useInView } from "../components/motion.jsx";
import { Badge, Button, Card, Skeleton, cx, formatPeso } from "../components/ui.jsx";
import {
  BoxIcon,
  ChatIcon,
  CheckIcon,
  GlobeIcon,
  LeafMark,
  MicIcon,
  PesoIcon,
  PhoneIcon,
  PinIcon,
  RouteIcon,
  SmsIcon,
  SparkleIcon,
  SproutIcon,
  StoreIcon,
  TruckIcon,
  UsersIcon,
} from "../components/icons.jsx";

const STEPS = [
  {
    icon: SparkleIcon,
    title: "Say what you need",
    body: "Text, message, type, or speak it in your own words — “5 sako urea ug 2 sako abono”. We read Tagalog, Bisaya, and English.",
  },
  {
    icon: CheckIcon,
    title: "Confirm the details",
    body: "AI turns your message into a clear request — products, quantities, barangay, date. Reply OO to confirm.",
  },
  {
    icon: StoreIcon,
    title: "Verified suppliers quote",
    body: "Suppliers who carry the product or cover your barangay send prices, quantities, and delivery dates. You choose.",
  },
  {
    icon: TruckIcon,
    title: "Track until delivered",
    body: "Follow your order from confirmed to delivered, then rate the supplier and earn AgriPoints.",
  },
];

const CHANNELS = [
  { icon: SproutIcon, title: "Web app", body: "Request inputs, compare offers, and track every order from a phone or computer." },
  { icon: SmsIcon, title: "SMS", body: "No internet? Order, check status, and get offer alerts by text from any basic phone." },
  { icon: ChatIcon, title: "Facebook Messenger", body: "Message the AgriConnect page like chatting with a friend — the same AI reads your order." },
  { icon: PhoneIcon, title: "Chat & calls", body: "Chat or call suppliers inside the app about price, delivery, and pickup — or tap to dial." },
];

const LANGUAGE_EXAMPLES = [
  {
    lang: "Tagalog",
    text: "Pwede po mag-order ng 10 sako urea, kailangan bago mag Mayo",
    understood: ["Urea (46-0-0) · 10 sacks", "before May"],
  },
  {
    lang: "Bisaya",
    text: "Sir, palit ko 5 sako urea ug 2 sako abono. Hatod sa Brgy. Katipunan sunod semana",
    understood: ["Urea · 5 sacks", "Complete (14-14-14) · 2 sacks", "Brgy. Katipunan", "next week"],
  },
  {
    lang: "English",
    text: "need 50kg hybrid corn seeds brgy new rizal asap",
    understood: ["Hybrid corn seeds · 50 kg", "Brgy. New Rizal", "as soon as possible"],
  },
];

const FARMER_BENEFITS = [
  "Compare quotations from verified suppliers before you commit",
  "Order by SMS or Messenger — no smartphone needed",
  "Delivery to your barangay, tracked until it arrives",
  "Earn AgriPoints for every completed order",
];

const SUPPLIER_BENEFITS = [
  "See new requests nearby and for the products you sell",
  "Send quotations with your price, stock, and delivery option",
  "Reach whole barangays at once with pooled-demand offers",
  "Build your rating with every completed delivery",
];

// ---------------------------------------------------------------------------
// Hero: a phone that plays the real AgriConnect flow on a loop —
// farmer texts → AI reads it → farmer replies OO → suppliers quote.

const CHAT_SCRIPT = [
  { who: "farmer", wait: 700 },
  { who: "bot", wait: 900 },
  { who: "farmer", wait: 1600 },
  { who: "bot", wait: 700 },
  { who: "bot", wait: 1300 },
];
const CHAT_HOLD_MS = 4500;

function useChatPlayback() {
  const reduced = prefersReducedMotion();
  const [shown, setShown] = useState(reduced ? CHAT_SCRIPT.length : 0);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    if (reduced) return;
    const timers = [];
    if (shown >= CHAT_SCRIPT.length) {
      timers.push(setTimeout(() => setShown(0), CHAT_HOLD_MS));
    } else {
      const next = CHAT_SCRIPT[shown];
      timers.push(
        setTimeout(() => {
          if (next.who === "bot") {
            setTyping(true);
            timers.push(
              setTimeout(() => {
                setTyping(false);
                setShown((n) => n + 1);
              }, 1100)
            );
          } else {
            setShown((n) => n + 1);
          }
        }, next.wait)
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [shown, reduced]);

  return { shown, typing };
}

function Bubble({ from, children, className }) {
  return (
    <div
      className={cx(
        "w-fit max-w-[88%] animate-pop-in rounded-2xl px-3 py-2",
        from === "farmer"
          ? "ml-auto rounded-br-md bg-sky-500 text-white"
          : "rounded-bl-md bg-white text-stone-800 shadow-sm ring-1 ring-stone-200/60",
        className
      )}
    >
      {children}
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex w-fit animate-pop-in items-center gap-1 rounded-2xl rounded-bl-md bg-white px-3 py-3 shadow-sm ring-1 ring-stone-200/60">
      {[0, 150, 300].map((d) => (
        <span key={d} className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-stone-400" style={{ animationDelay: `${d}ms` }} />
      ))}
    </div>
  );
}

const CHAT_MESSAGES = [
  <Bubble key="m1" from="farmer">
    Sir, palit ko 5 sako urea ug 2 sako abono. Hatod sa Katipunan sunod semana 🙏
  </Bubble>,
  <Bubble key="m2" from="bot" className="w-[88%]">
    <p className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-brand-600">
      <SparkleIcon className="h-3 w-3" /> AI read your order
    </p>
    <ul className="space-y-1 text-[12px]">
      {["Urea (46-0-0) · 5 sacks", "Complete 14-14-14 · 2 sacks", "Brgy. Katipunan · next week"].map((line, i) => (
        <li key={line} className="flex animate-pop-in items-center gap-1.5" style={{ animationDelay: `${150 + i * 180}ms` }}>
          <CheckIcon className="h-3.5 w-3.5 shrink-0 text-brand-600" /> {line}
        </li>
      ))}
    </ul>
    <p className="mt-1.5 text-[11px] text-stone-500">
      Reply <strong className="text-stone-800">OO</strong> to confirm.
    </p>
  </Bubble>,
  <Bubble key="m3" from="farmer">
    OO
  </Bubble>,
  <Bubble key="m4" from="bot">
    Salamat! Na-record na. Ipapadala namin ang quotes ng supplier. ✅
  </Bubble>,
  <Bubble key="m5" from="bot" className="w-[88%]">
    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-harvest-600">3 quotations received</p>
    {[
      ["Katipunan Farmers Coop", "₱1,100"],
      ["GreenFields Agri", "₱1,150"],
      ["Mindanao AgriHub", "₱1,180"],
    ].map(([name, price], i) => (
      <div
        key={name}
        className={cx(
          "mt-1 flex animate-pop-in items-center justify-between rounded-lg px-2 py-1 text-[12px]",
          i === 0 ? "bg-brand-50 font-semibold text-brand-800 ring-1 ring-brand-200" : "text-stone-600"
        )}
        style={{ animationDelay: `${120 + i * 160}ms` }}
      >
        <span className="truncate">{name}</span>
        <span className="ml-2 shrink-0">{price}/sack</span>
      </div>
    ))}
  </Bubble>,
];

function HeroVisual() {
  const { shown, typing } = useChatPlayback();
  return (
    <div className="relative mx-auto w-full max-w-sm animate-rise [animation-delay:300ms]" aria-hidden="true">
      <div className="absolute -inset-8 rounded-[3rem] bg-gradient-to-br from-brand-400/35 via-harvest-300/20 to-transparent blur-2xl" />
      <div className="relative rounded-[2.2rem] border border-white/15 bg-brand-950/70 p-3 shadow-2xl backdrop-blur">
        <div className="mx-auto mb-2 h-1.5 w-16 rounded-full bg-white/20" />
        <div className="overflow-hidden rounded-[1.6rem] bg-stone-100">
          <div className="flex items-center gap-2 border-b border-stone-200 bg-white/80 px-4 py-3">
            <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-brand-600">
              <LeafMark className="h-4 w-4 text-brand-100" />
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-white" />
            </span>
            <div>
              <p className="text-xs font-bold text-stone-900">AgriConnect</p>
              <p className="text-[10px] text-stone-500">{typing ? "typing…" : "SMS · online"}</p>
            </div>
          </div>
          <div
            className="flex h-[330px] flex-col justify-end gap-2.5 overflow-hidden p-4 text-[13px] leading-snug"
            style={{
              maskImage: "linear-gradient(to bottom, transparent, black 18%)",
              WebkitMaskImage: "linear-gradient(to bottom, transparent, black 18%)",
            }}
          >
            {CHAT_MESSAGES.slice(0, shown)}
            {typing && <TypingBubble />}
          </div>
        </div>
      </div>
      <div className="absolute -bottom-7 -left-10 hidden motion-safe:animate-float rounded-2xl bg-white p-3 text-stone-900 shadow-lift ring-1 ring-stone-200 sm:block">
        <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">Pooled order</p>
        <p className="text-sm font-extrabold">125 sacks · 9 farmers</p>
      </div>
      <div className="absolute -right-10 -top-7 hidden motion-safe:animate-float-slow rounded-2xl bg-white p-3 text-stone-900 shadow-lift ring-1 ring-stone-200 [animation-delay:1.2s] sm:block">
        <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">You save</p>
        <p className="text-sm font-extrabold text-brand-700">1 trip to town</p>
      </div>
    </div>
  );
}

// Slowly drifting glow blobs and falling leaves behind the hero.
const LEAVES = [
  { left: "6%", size: 14, duration: 16, delay: 0 },
  { left: "18%", size: 10, duration: 21, delay: 6 },
  { left: "31%", size: 18, duration: 18, delay: 3 },
  { left: "47%", size: 12, duration: 24, delay: 9 },
  { left: "58%", size: 16, duration: 19, delay: 1 },
  { left: "72%", size: 11, duration: 22, delay: 12 },
  { left: "84%", size: 15, duration: 17, delay: 5 },
  { left: "94%", size: 9, duration: 25, delay: 8 },
];

function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 15% 0%, rgba(81,179,127,0.35), transparent 55%), radial-gradient(ellipse at 90% 100%, rgba(249,154,36,0.22), transparent 50%)",
        }}
      />
      <div className="absolute -left-24 top-10 h-72 w-72 motion-safe:animate-blob rounded-full bg-brand-500/25 blur-3xl" />
      <div className="absolute -right-16 bottom-0 h-80 w-80 motion-safe:animate-blob rounded-full bg-harvest-400/15 blur-3xl [animation-delay:-6s]" />
      <div className="absolute left-1/3 top-1/2 h-60 w-60 motion-safe:animate-blob rounded-full bg-emerald-300/10 blur-3xl [animation-delay:-12s]" />
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage: "linear-gradient(to bottom, black, transparent 85%)",
          WebkitMaskImage: "linear-gradient(to bottom, black, transparent 85%)",
        }}
      />
      {LEAVES.map((leaf) => (
        <LeafMark
          key={leaf.left}
          className="absolute top-0 motion-safe:animate-leaf-fall motion-reduce:hidden text-brand-300/40"
          style={{
            left: leaf.left,
            width: leaf.size,
            height: leaf.size,
            animationDuration: `${leaf.duration}s`,
            animationDelay: `-${leaf.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

function useLiveStats() {
  const [stats, setStats] = useState({ loading: true });
  useEffect(() => {
    let cancelled = false;
    Promise.all([apiClient.get("/impact/summary"), apiClient.get("/suppliers")])
      .then(([impact, suppliers]) => {
        if (cancelled) return;
        setStats({
          loading: false,
          farmers: impact.farmers.total,
          requests: impact.requests.submitted,
          suppliers: suppliers.length,
          trips: impact.impact.trips_avoided,
          savings: impact.impact.estimated_savings_php,
        });
      })
      .catch(() => !cancelled && setStats({ loading: false, unavailable: true }));
    return () => {
      cancelled = true;
    };
  }, []);
  return stats;
}

function StatItem({ item, loading, active, className }) {
  const value = useCountUp(item.value ?? 0, active && !loading);
  return (
    <div className={cx("group p-4", className)}>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-500">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-50 text-brand-600 transition group-hover:scale-110 group-hover:bg-brand-100">
          <item.icon className="h-3.5 w-3.5" />
        </span>
        {item.label}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-16" />
      ) : (
        <p className="mt-1.5 text-2xl font-extrabold tabular-nums tracking-tight text-stone-900">
          {item.format ? item.format(value) : value.toLocaleString("en-PH")}
        </p>
      )}
    </div>
  );
}

function LiveStats() {
  const stats = useLiveStats();
  const [ref, inView] = useInView();
  if (stats.unavailable) return null;
  const items = [
    { icon: UsersIcon, label: "Farmers registered", value: stats.farmers },
    { icon: BoxIcon, label: "Requests made", value: stats.requests },
    { icon: StoreIcon, label: "Verified suppliers", value: stats.suppliers },
    { icon: RouteIcon, label: "Trips avoided", value: stats.trips },
    { icon: PesoIcon, label: "Estimated savings", value: stats.savings, format: formatPeso },
  ];
  return (
    <section ref={ref} aria-label="Live program numbers" className="relative z-10 -mt-12 mb-10">
      <Card className="grid animate-rise grid-cols-2 divide-stone-100 p-2 shadow-lift [animation-delay:450ms] sm:grid-cols-5 sm:divide-x">
        {items.map((item, i) => (
          <StatItem
            key={item.label}
            item={item}
            loading={stats.loading}
            active={inView}
            className={i === items.length - 1 ? "col-span-2 sm:col-span-1" : undefined}
          />
        ))}
      </Card>
      <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-stone-400">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-brand-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
        </span>
        Live numbers from this AgriConnect server
      </p>
    </section>
  );
}

// Scrolling strip of every barangay served (from GET /api/locations).
function BarangayMarquee() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let cancelled = false;
    apiClient
      .get("/locations")
      .then((d) => !cancelled && setData(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  if (!data?.barangays?.length) return null;

  const row = data.barangays.map((b) => (
    <span
      key={b}
      className="mx-1.5 inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold text-stone-700 ring-1 ring-stone-200 transition hover:bg-brand-50 hover:text-brand-800 hover:ring-brand-200"
    >
      <PinIcon className="h-3.5 w-3.5 text-brand-500" /> {b}
    </span>
  ));

  return (
    <Reveal as="section" className="mb-20" aria-label={`Barangays of ${data.municipality}`}>
      <p className="mb-4 text-center text-sm font-semibold text-stone-500">
        Serving all <span className="font-extrabold text-brand-700">{data.barangays.length} barangays</span> of{" "}
        {data.municipality}, Cotabato
      </p>
      <div
        className="group relative overflow-hidden py-1"
        style={{
          maskImage: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
          WebkitMaskImage: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
        }}
      >
        <div className="flex w-max motion-safe:animate-marquee group-hover:[animation-play-state:paused]">
          {row}
          <span aria-hidden="true" className="flex">
            {row}
          </span>
        </div>
      </div>
    </Reveal>
  );
}

function SectionHeading({ eyebrow, title, description }) {
  return (
    <Reveal className="mx-auto mb-10 max-w-2xl text-center">
      <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-700 ring-1 ring-brand-100">
        <LeafMark className="h-3 w-3" /> {eyebrow}
      </p>
      <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-stone-900 sm:text-[34px] sm:leading-tight">{title}</h2>
      {description && <p className="mt-3 text-stone-500">{description}</p>}
    </Reveal>
  );
}

function LanguageCard({ ex, index }) {
  const [ref, inView] = useInView();
  return (
    <div
      ref={ref}
      className={cx(inView ? "animate-rise" : "opacity-0")}
      style={inView ? { animationDelay: `${index * 120}ms` } : undefined}
    >
      <Card className="flex h-full flex-col p-5 transition duration-300 hover:-translate-y-1 hover:shadow-lift">
        <Badge tone="blue" className="self-start">
          <GlobeIcon className="h-3 w-3" /> {ex.lang}
        </Badge>
        <p className="mt-3 flex-1 text-[15px] italic text-stone-700">“{ex.text}”</p>
        <div className="mt-4 border-t border-dashed border-stone-200 pt-3">
          <p className="mb-2 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-stone-400">
            <SparkleIcon className="h-3 w-3 text-brand-500" /> We understood
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ex.understood.map((u, i) => (
              <span
                key={u}
                className={cx(inView ? "animate-pop-in" : "opacity-0")}
                style={inView ? { animationDelay: `${index * 120 + 400 + i * 140}ms` } : undefined}
              >
                <Badge tone="green">{u}</Badge>
              </span>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

export default function HomePage() {
  const session = useSession();
  const { farmer, supplier } = session;
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Signed in as that role already → go to its dashboard; otherwise sign up.
  function enter(role) {
    if (session[role]) {
      setActiveRole(role);
      navigate("/dashboard");
    } else {
      navigate("/start", { role });
    }
  }

  return (
    <div className="overflow-x-clip">
      <header
        className={cx(
          "sticky top-0 z-40 text-white transition-all duration-300",
          scrolled ? "bg-brand-950/85 shadow-lg shadow-brand-950/20 backdrop-blur-md" : "bg-brand-900"
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <span className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
              <LeafMark className="h-6 w-6 text-brand-300" />
            </span>
            <span>
              <span className="block text-xl font-extrabold tracking-tight">AgriConnect</span>
              <span className="block text-xs text-harvest-200">Farm Inputs, Closer to You.</span>
            </span>
          </span>
          {session.role ? (
            <Button size="sm" onClick={() => navigate("/dashboard")} variant="light">
              Open my dashboard
            </Button>
          ) : (
            <Button size="sm" onClick={() => navigate("/start")} variant="light">
              Get started
            </Button>
          )}
        </div>
      </header>

      {/* Hero — full-bleed; the rest of the page sits in the usual container */}
      <section className="relative overflow-hidden bg-brand-900 px-4 pb-28 pt-12 text-white sm:px-6 sm:pt-16">
        <HeroBackdrop />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <span className="inline-flex animate-rise items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-brand-100 ring-1 ring-white/15 backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-harvest-300 opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-harvest-300" />
              </span>
              Sama-samang pagbili para sa barangay
            </span>
            <h1 className="mt-5 animate-rise text-4xl font-extrabold leading-[1.08] tracking-tight [animation-delay:100ms] sm:text-6xl">
              Farm inputs,
              <span className="block motion-safe:animate-gradient-x bg-gradient-to-r from-brand-300 via-harvest-300 to-brand-300 bg-[length:200%_auto] bg-clip-text pb-1 text-transparent">
                closer to you.
              </span>
            </h1>
            <p className="mt-5 max-w-xl animate-rise text-base text-brand-50/85 [animation-delay:200ms] sm:text-lg">
              AgriConnect connects small farmers with verified suppliers. Order fertilizer, seeds, pesticides, and feeds by text or app, compare quotations, and get them delivered to your barangay.
            </p>
            <div className="mt-8 flex animate-rise flex-col gap-3 [animation-delay:300ms] sm:flex-row">
              <Button
                size="lg"
                icon={SproutIcon}
                onClick={() => enter("farmer")}
                variant="light"
                className="shadow-lg shadow-brand-950/30 transition hover:-translate-y-0.5 hover:shadow-xl"
              >
                {farmer ? `Continue as ${farmer.name.split(" ")[0]}` : "I'm a farmer"}
              </Button>
              <Button
                size="lg"
                variant="outlineLight"
                icon={StoreIcon}
                onClick={() => enter("supplier")}
                className="transition hover:-translate-y-0.5"
              >
                {supplier ? "Open supplier app" : "I'm a supplier"}
              </Button>
            </div>
            <ul className="mt-8 flex animate-rise flex-wrap gap-x-6 gap-y-2 text-sm text-brand-100/80 [animation-delay:400ms]">
              <li className="flex items-center gap-1.5">
                <GlobeIcon className="h-4 w-4" /> Tagalog, Bisaya & English
              </li>
              <li className="flex items-center gap-1.5">
                <SmsIcon className="h-4 w-4" /> Order by SMS or Messenger
              </li>
              <li className="flex items-center gap-1.5">
                <MicIcon className="h-4 w-4" /> Speak your order
              </li>
            </ul>
          </div>
          <HeroVisual />
        </div>
        {/* Soft wave into the page */}
        <svg
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-10 w-full text-stone-50 sm:h-14"
          viewBox="0 0 1440 80"
          preserveAspectRatio="none"
        >
          <path fill="currentColor" d="M0,48 C240,88 480,8 720,32 C960,56 1200,72 1440,36 L1440,80 L0,80 Z" />
        </svg>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <LiveStats />
        <BarangayMarquee />

        {/* How it works */}
        <section className="mb-20">
          <SectionHeading
            eyebrow="How it works"
            title="From one message to a delivery at your barangay"
            description="Ask once — by text, Messenger, or the app — and let verified suppliers compete for your order."
          />
          <ol className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <Reveal as="li" key={step.title} delay={i * 120}>
                <Card className="group relative h-full overflow-hidden p-5 transition duration-300 hover:-translate-y-1.5 hover:border-brand-200 hover:shadow-lift">
                  <div className="absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-gradient-to-r from-brand-400 to-harvest-300 transition-transform duration-500 group-hover:scale-x-100" />
                  <div className="flex items-center justify-between">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 transition duration-300 group-hover:rotate-6 group-hover:scale-110 group-hover:bg-brand-600 group-hover:text-white">
                      <step.icon className="h-5 w-5" />
                    </span>
                    <span className="text-3xl font-extrabold text-stone-200 transition-colors group-hover:text-brand-200">{i + 1}</span>
                  </div>
                  <h3 className="mt-4 font-bold text-stone-900">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-stone-500">{step.body}</p>
                </Card>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* The full process (BPMN) */}
        <section className="mb-20">
          <SectionHeading
            eyebrow="The AgriConnect process"
            title="From a farmer's text to a fulfilled order"
            description="Five phases, with farmers, suppliers, the AI system, and your barangay, LGU, or cooperative each doing their part."
          />
          <Reveal>
            <ProcessFlow />
          </Reveal>
        </section>

        {/* Language demo */}
        <section className="mb-20">
          <SectionHeading
            eyebrow="Speaks your language"
            title="Write it the way you'd say it"
            description="No forms to fill. Our reader understands everyday Tagalog, Bisaya, and English — misspellings and text-speak included."
          />
          <div className="grid gap-4 md:grid-cols-3">
            {LANGUAGE_EXAMPLES.map((ex, i) => (
              <LanguageCard key={ex.lang} ex={ex} index={i} />
            ))}
          </div>
        </section>

        {/* Channels */}
        <Reveal
          as="section"
          className="mb-20 rounded-3xl bg-gradient-to-br from-harvest-50 via-white to-brand-50 px-5 py-12 ring-1 ring-stone-200/70 sm:px-10"
        >
          <SectionHeading
            eyebrow="Stay connected"
            title="Reach each other however works for you"
            description="Smartphone, basic phone, or computer — farmers and suppliers can always get through."
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CHANNELS.map((c, i) => (
              <Reveal
                key={c.title}
                delay={i * 100}
                className="group rounded-2xl bg-white/80 p-5 ring-1 ring-stone-200/70 transition duration-300 hover:-translate-y-1 hover:bg-white hover:shadow-lift"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-harvest-100 text-harvest-600 transition duration-300 group-hover:-rotate-6 group-hover:scale-110">
                  <c.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-3 font-bold text-stone-900">{c.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-stone-500">{c.body}</p>
              </Reveal>
            ))}
          </div>
          <div className="mx-auto mt-8 max-w-xl rounded-2xl bg-white p-4 text-sm shadow-card ring-1 ring-stone-200">
            <p className="mb-2 flex items-center gap-2 font-bold text-stone-900">
              <SmsIcon className="h-4 w-4 text-harvest-500" /> SMS commands
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-stone-600">
              {[
                ["REG Name, Barangay, Town", "register"],
                ["10 sako urea", "order in your own words"],
                ["STATUS", "see your requests"],
                ["HELP", "instructions"],
              ].map(([cmd, meaning]) => (
                <div key={cmd} className="contents">
                  <dt>
                    <code className="rounded-md bg-stone-100 px-1.5 py-0.5 font-semibold text-stone-900">{cmd}</code>
                  </dt>
                  <dd>{meaning}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Reveal>

        {/* Audiences */}
        <section className="mb-20 grid gap-5 md:grid-cols-2">
          {[
            { title: "For farmers", icon: SproutIcon, benefits: FARMER_BENEFITS, cta: "Start as a farmer", role: "farmer", dark: true },
            { title: "For suppliers", icon: StoreIcon, benefits: SUPPLIER_BENEFITS, cta: "Start as a supplier", role: "supplier", dark: false },
          ].map((a, i) => (
            <Reveal
              key={a.title}
              delay={i * 150}
              className={cx(
                "group relative flex flex-col overflow-hidden rounded-3xl p-7 transition duration-300 hover:-translate-y-1",
                a.dark ? "bg-brand-800 text-white hover:shadow-2xl hover:shadow-brand-900/30" : "bg-white text-stone-900 shadow-card ring-1 ring-stone-200 hover:shadow-lift"
              )}
            >
              <LeafMark
                aria-hidden="true"
                className={cx(
                  "absolute -right-6 -top-6 h-32 w-32 rotate-12 transition-transform duration-700 group-hover:rotate-45 group-hover:scale-110",
                  a.dark ? "text-white opacity-[0.06]" : "text-brand-500 opacity-[0.07]"
                )}
              />
              <span
                className={cx(
                  "flex h-11 w-11 items-center justify-center rounded-2xl",
                  a.dark ? "bg-white/10 text-brand-200" : "bg-brand-50 text-brand-700"
                )}
              >
                <a.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-xl font-extrabold">{a.title}</h3>
              <ul className="mt-4 flex-1 space-y-2.5">
                {a.benefits.map((b) => (
                  <li key={b} className="flex gap-2.5 text-sm">
                    <CheckIcon className={cx("mt-0.5 h-4 w-4 shrink-0", a.dark ? "text-brand-300" : "text-brand-600")} />
                    <span className={a.dark ? "text-brand-50/90" : "text-stone-600"}>{b}</span>
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => enter(a.role)}
                variant={a.dark ? "light" : "primary"}
                className="mt-6 self-start transition hover:-translate-y-0.5"
              >
                {a.cta}
              </Button>
            </Reveal>
          ))}
        </section>

        {/* Closing CTA */}
        <Reveal
          as="section"
          className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-r from-brand-700 to-brand-900 px-6 py-12 text-center text-white sm:px-12"
        >
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute -left-16 -top-16 h-56 w-56 motion-safe:animate-blob rounded-full bg-brand-400/25 blur-3xl" />
            <div className="absolute -bottom-20 -right-10 h-64 w-64 motion-safe:animate-blob rounded-full bg-harvest-400/20 blur-3xl [animation-delay:-8s]" />
          </div>
          <div className="relative">
            <LeafMark className="mx-auto h-12 w-12 motion-safe:animate-float text-brand-300" />
            <h2 className="mt-4 text-2xl font-extrabold tracking-tight sm:text-4xl">Start with one message.</h2>
            <p className="mx-auto mt-2 max-w-lg text-brand-50/85">
              Tell us what your farm needs this season — verified suppliers will send you their best prices.
            </p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Button size="lg" onClick={() => enter("farmer")} variant="light" className="transition hover:-translate-y-0.5">
                Make a request
              </Button>
              <Button size="lg" variant="outlineLight" onClick={() => enter("staff")} className="transition hover:-translate-y-0.5">
                Barangay / LGU / Coop sign-in
              </Button>
            </div>
          </div>
        </Reveal>

        <footer className="flex flex-col items-center justify-between gap-2 border-t border-stone-200 py-6 text-xs text-stone-400 sm:flex-row">
          <span className="flex items-center gap-1.5">
            <LeafMark className="h-4 w-4 text-brand-500" /> AgriConnect · M'lang, Cotabato
          </span>
          <a href={`${BASE_URL}/docs`} className="font-semibold text-stone-500 hover:text-brand-700">
            API documentation
          </a>
        </footer>
      </div>
    </div>
  );
}
