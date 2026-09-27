import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { navigate } from "../lib/router";
import { setActiveRole, useSession } from "../lib/session";
import ProcessFlow from "../components/ProcessFlow.jsx";
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
    text: "need 50kg hybrid corn seeds brgy poblacion asap",
    understood: ["Hybrid corn seeds · 50 kg", "Brgy. Poblacion", "as soon as possible"],
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

function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-sm" aria-hidden="true">
      <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-br from-brand-400/30 via-harvest-300/20 to-transparent blur-2xl" />
      <div className="relative rounded-[2rem] border border-white/15 bg-brand-950/60 p-3 shadow-lift backdrop-blur">
        <div className="rounded-[1.5rem] bg-stone-100 p-4">
          <div className="mb-4 flex items-center gap-2 border-b border-stone-200 pb-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600">
              <LeafMark className="h-4 w-4 text-brand-100" />
            </span>
            <div>
              <p className="text-xs font-bold text-stone-900">AgriConnect</p>
              <p className="text-[10px] text-stone-500">SMS</p>
            </div>
          </div>
          <div className="space-y-2.5 text-[13px] leading-snug">
            <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-sky-500 px-3 py-2 text-white">
              10 sako urea po bago mag Mayo
            </div>
            <div className="w-fit max-w-[88%] rounded-2xl rounded-bl-md bg-white px-3 py-2 text-stone-800 shadow-sm">
              Salamat po! Natanggap namin: 10 sacks Urea (46-0-0). Ipapaalam namin kapag may alok na.
            </div>
            <div className="w-fit max-w-[88%] rounded-2xl rounded-bl-md bg-white px-3 py-2 text-stone-800 shadow-sm">
              May bagong alok: ₱1,380/sack, deliver sa Barangay Hall. 🌾
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-7 -left-10 hidden rounded-2xl bg-white p-3 text-stone-900 shadow-lift ring-1 ring-stone-200 sm:block">
        <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">Pooled order</p>
        <p className="text-sm font-extrabold">125 sacks · 9 farmers</p>
      </div>
      <div className="absolute -right-10 -top-7 hidden rounded-2xl bg-white p-3 text-stone-900 shadow-lift ring-1 ring-stone-200 sm:block">
        <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">You save</p>
        <p className="text-sm font-extrabold text-brand-700">1 trip to town</p>
      </div>
    </div>
  );
}

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

function LiveStats() {
  const stats = useLiveStats();
  if (stats.unavailable) return null;
  const items = [
    { icon: UsersIcon, label: "Farmers registered", value: stats.farmers },
    { icon: BoxIcon, label: "Requests made", value: stats.requests },
    { icon: StoreIcon, label: "Verified suppliers", value: stats.suppliers },
    { icon: RouteIcon, label: "Trips avoided", value: stats.trips },
    { icon: PesoIcon, label: "Estimated savings", value: stats.savings != null ? formatPeso(stats.savings) : null },
  ];
  return (
    <section aria-label="Live program numbers" className="relative z-10 -mt-10 mb-16">
      <Card className="grid grid-cols-2 divide-stone-100 p-2 sm:grid-cols-5 sm:divide-x">
        {items.map((item, i) => (
          <div key={item.label} className={cx("p-4", i === items.length - 1 && "col-span-2 sm:col-span-1")}>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-500">
              <item.icon className="h-4 w-4 text-brand-600" /> {item.label}
            </div>
            {stats.loading ? (
              <Skeleton className="mt-2 h-7 w-16" />
            ) : (
              <p className="mt-1 text-2xl font-extrabold tracking-tight text-stone-900">{item.value ?? 0}</p>
            )}
          </div>
        ))}
      </Card>
      <p className="mt-2 text-center text-xs text-stone-400">Live numbers from this AgriConnect server</p>
    </section>
  );
}

function SectionHeading({ eyebrow, title, description }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      <p className="text-xs font-bold uppercase tracking-wider text-brand-600">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-stone-900 sm:text-3xl">{title}</h2>
      {description && <p className="mt-3 text-stone-500">{description}</p>}
    </div>
  );
}

export default function HomePage() {
  const session = useSession();
  const { farmer, supplier } = session;

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
    <div>
      <header className="bg-brand-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <span className="flex items-center gap-2.5">
            <LeafMark className="h-9 w-9 text-brand-300" />
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
      <section className="relative overflow-hidden bg-brand-900 px-4 pb-24 pt-12 text-white sm:px-6 sm:pt-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at 15% 0%, rgba(81,179,127,0.35), transparent 55%), radial-gradient(ellipse at 90% 100%, rgba(249,154,36,0.22), transparent 50%)",
          }}
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-brand-100 ring-1 ring-white/15">
              <SproutIcon className="h-3.5 w-3.5" /> Sama-samang pagbili para sa barangay
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
              Farm inputs,
              <span className="block text-brand-300">closer to you.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-brand-50/85 sm:text-lg">
              AgriConnect connects small farmers with verified suppliers. Order fertilizer, seeds, pesticides, and feeds by text or app, compare quotations, and get them delivered to your barangay.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" icon={SproutIcon} onClick={() => enter("farmer")} variant="light">
                {farmer ? `Continue as ${farmer.name.split(" ")[0]}` : "I'm a farmer"}
              </Button>
              <Button
                size="lg"
                variant="outlineLight"
                icon={StoreIcon}
                onClick={() => enter("supplier")}
              >
                {supplier ? "Open supplier app" : "I'm a supplier"}
              </Button>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-brand-100/80">
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
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <LiveStats />

      {/* How it works */}
      <section className="mb-20">
        <SectionHeading
          eyebrow="How it works"
          title="From one message to a delivery at your barangay"
          description="Ask once — by text, Messenger, or the app — and let verified suppliers compete for your order."
        />
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <Card className="h-full p-5">
                <div className="flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                    <step.icon className="h-5 w-5" />
                  </span>
                  <span className="text-3xl font-extrabold text-stone-200">{i + 1}</span>
                </div>
                <h3 className="mt-4 font-bold text-stone-900">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-stone-500">{step.body}</p>
              </Card>
            </li>
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
        <ProcessFlow />
      </section>

      {/* Language demo */}
      <section className="mb-20">
        <SectionHeading
          eyebrow="Speaks your language"
          title="Write it the way you'd say it"
          description="No forms to fill. Our reader understands everyday Tagalog, Bisaya, and English — misspellings and text-speak included."
        />
        <div className="grid gap-4 md:grid-cols-3">
          {LANGUAGE_EXAMPLES.map((ex) => (
            <Card key={ex.lang} className="flex flex-col p-5">
              <Badge tone="blue" className="self-start">
                <GlobeIcon className="h-3 w-3" /> {ex.lang}
              </Badge>
              <p className="mt-3 flex-1 text-[15px] italic text-stone-700">“{ex.text}”</p>
              <div className="mt-4 border-t border-dashed border-stone-200 pt-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-stone-400">We understood</p>
                <div className="flex flex-wrap gap-1.5">
                  {ex.understood.map((u) => (
                    <Badge key={u} tone="green">
                      {u}
                    </Badge>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Channels */}
      <section className="mb-20 rounded-3xl bg-gradient-to-br from-harvest-50 via-white to-brand-50 px-5 py-12 ring-1 ring-stone-200/70 sm:px-10">
        <SectionHeading
          eyebrow="Stay connected"
          title="Reach each other however works for you"
          description="Smartphone, basic phone, or computer — farmers and suppliers can always get through."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CHANNELS.map((c) => (
            <div key={c.title} className="rounded-2xl bg-white/80 p-5 ring-1 ring-stone-200/70">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-harvest-100 text-harvest-600">
                <c.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-3 font-bold text-stone-900">{c.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-stone-500">{c.body}</p>
            </div>
          ))}
        </div>
        <div className="mx-auto mt-8 max-w-xl rounded-2xl bg-white p-4 text-sm ring-1 ring-stone-200">
          <p className="mb-2 flex items-center gap-2 font-bold text-stone-900">
            <SmsIcon className="h-4 w-4 text-harvest-500" /> SMS commands
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-stone-600">
            <dt>
              <code className="font-semibold text-stone-900">REG Name, Barangay, Town</code>
            </dt>
            <dd>register</dd>
            <dt>
              <code className="font-semibold text-stone-900">10 sako urea</code>
            </dt>
            <dd>order in your own words</dd>
            <dt>
              <code className="font-semibold text-stone-900">STATUS</code>
            </dt>
            <dd>see your requests</dd>
            <dt>
              <code className="font-semibold text-stone-900">HELP</code>
            </dt>
            <dd>instructions</dd>
          </dl>
        </div>
      </section>

      {/* Audiences */}
      <section className="mb-20 grid gap-5 md:grid-cols-2">
        {[
          { title: "For farmers", icon: SproutIcon, benefits: FARMER_BENEFITS, cta: "Start as a farmer", role: "farmer", dark: true },
          { title: "For suppliers", icon: StoreIcon, benefits: SUPPLIER_BENEFITS, cta: "Start as a supplier", role: "supplier", dark: false },
        ].map((a) => (
          <div
            key={a.title}
            className={cx(
              "flex flex-col rounded-3xl p-7",
              a.dark ? "bg-brand-800 text-white" : "bg-white text-stone-900 shadow-card ring-1 ring-stone-200"
            )}
          >
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
              className="mt-6 self-start"
            >
              {a.cta}
            </Button>
          </div>
        ))}
      </section>

      {/* Closing CTA */}
      <section className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-r from-brand-700 to-brand-900 px-6 py-10 text-center text-white sm:px-12">
        <LeafMark className="mx-auto h-10 w-10 text-brand-300" />
        <h2 className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl">Start with one message.</h2>
        <p className="mx-auto mt-2 max-w-lg text-brand-50/85">
          Tell us what your farm needs this season — verified suppliers will send you their best prices.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Button size="lg" onClick={() => enter("farmer")} variant="light">
            Make a request
          </Button>
          <Button
            size="lg"
            variant="outlineLight"
            onClick={() => enter("staff")}
          >
            Barangay / LGU / Coop sign-in
          </Button>
        </div>
      </section>
      </div>
    </div>
  );
}
