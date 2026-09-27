import { useState } from "react";
import { apiClient } from "../api/client";
import { navigate } from "../lib/router";
import { setIdentity } from "../lib/session";
import { Alert, Button, Card, Field, Input, cx } from "../components/ui.jsx";
import { ArrowLeftIcon, CheckIcon, LeafMark, ShieldCheckIcon, SproutIcon, StoreIcon } from "../components/icons.jsx";

const ROLE_CHOICES = [
  { role: "farmer", icon: SproutIcon, title: "I'm a farmer", body: "Request farm inputs, compare supplier quotations, and track deliveries." },
  { role: "supplier", icon: StoreIcon, title: "I'm a supplier", body: "List your products, see farmers' requests nearby, and send quotations." },
  {
    role: "staff",
    icon: ShieldCheckIcon,
    title: "Barangay / LGU / Coop",
    body: "Verify farmers, help process SMS and Messenger requests, and view reports.",
  },
];

function FarmerForm({ onDone }) {
  const [form, setForm] = useState({ name: "", phone_number: "", barangay: "", municipality: "" });
  const [farmer, setFarmer] = useState(null);
  const [otp, setOtp] = useState(null); // { dev_code?, phone }
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function register(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await apiClient.post("/farmers/register", form);
      setIdentity("farmer", { id: created.id, name: created.name });
      setFarmer(created);
      if (created.phone_number && !created.phone_verified) {
        setOtp(await apiClient.post(`/farmers/${created.id}/otp`));
      } else {
        onDone();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiClient.post(`/farmers/${farmer.id}/otp/verify`, { code });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    try {
      setOtp(await apiClient.post(`/farmers/${farmer.id}/otp`));
    } catch (err) {
      setError(err.message);
    }
  }

  if (otp) {
    return (
      <form onSubmit={verify} className="space-y-4">
        <div>
          <h2 className="text-xl font-extrabold text-stone-900">Confirm your mobile number</h2>
          <p className="mt-1 text-sm text-stone-500">We texted a 6-digit code to {otp.phone}.</p>
        </div>
        {otp.dev_code && (
          <Alert tone="info" title="Development mode">
            SMS isn't connected to a gateway, so here is the code: <strong className="tracking-widest">{otp.dev_code}</strong>
          </Alert>
        )}
        {error && <Alert tone="error">{error}</Alert>}
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="••••••"
          className="h-14 text-center text-2xl font-bold tracking-[0.5em]"
          autoFocus
        />
        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={code.length !== 6}>
          Confirm number
        </Button>
        <div className="flex justify-between text-sm">
          <button type="button" onClick={resend} className="font-semibold text-brand-700 hover:text-brand-800">
            Send a new code
          </button>
          <button type="button" onClick={onDone} className="font-medium text-stone-500 hover:text-stone-700">
            Skip for now
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={register} className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold text-stone-900">Your farmer profile</h2>
        <p className="mt-1 text-sm text-stone-500">Your barangay, LGU, or cooperative will verify it before suppliers see your requests.</p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Full name">
        <Input value={form.name} onChange={set("name")} required autoFocus placeholder="Juan Dela Cruz" />
      </Field>
      <Field label="Mobile number" hint="(for SMS updates)">
        <Input value={form.phone_number} onChange={set("phone_number")} type="tel" inputMode="tel" placeholder="09XX XXX XXXX" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Barangay">
          <Input value={form.barangay} onChange={set("barangay")} required placeholder="Katipunan" />
        </Field>
        <Field label="Municipality">
          <Input value={form.municipality} onChange={set("municipality")} required placeholder="M'lang" />
        </Field>
      </div>
      <Button type="submit" size="lg" className="w-full" loading={busy}>
        Create profile
      </Button>
    </form>
  );
}

function SupplierForm({ onDone }) {
  const [form, setForm] = useState({ name: "", contact_person: "", phone: "", barangay: "", municipality: "", coverage_barangays: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const s = await apiClient.post("/suppliers/register", form);
      setIdentity("supplier", { id: s.id, name: s.name });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold text-stone-900">Your store</h2>
        <p className="mt-1 text-sm text-stone-500">Staff verify new stores before they can send quotations.</p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Store name">
        <Input value={form.name} onChange={set("name")} required autoFocus placeholder="GreenFields Agri Supply" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Contact person">
          <Input value={form.contact_person} onChange={set("contact_person")} />
        </Field>
        <Field label="Mobile number">
          <Input value={form.phone} onChange={set("phone")} type="tel" inputMode="tel" placeholder="09XX XXX XXXX" />
        </Field>
        <Field label="Barangay">
          <Input value={form.barangay} onChange={set("barangay")} />
        </Field>
        <Field label="Municipality">
          <Input value={form.municipality} onChange={set("municipality")} />
        </Field>
      </div>
      <Field label="Barangays you deliver to" hint="(comma-separated)">
        <Input value={form.coverage_barangays} onChange={set("coverage_barangays")} placeholder="Katipunan, Poblacion, Batal" />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={busy}>
        Create store
      </Button>
    </form>
  );
}

function StaffForm({ onDone }) {
  const [form, setForm] = useState({ name: "", org: "" });
  function submit(e) {
    e.preventDefault();
    setIdentity("staff", { id: "staff", name: form.name.trim(), org: form.org.trim() });
    onDone();
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold text-stone-900">Staff sign-in</h2>
        <p className="mt-1 text-sm text-stone-500">Your name and office are recorded on every verification you make.</p>
      </div>
      <Alert tone="warning">This prototype has no passwords yet — anyone can open the staff view.</Alert>
      <Field label="Your name">
        <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required autoFocus />
      </Field>
      <Field label="Office">
        <Input
          value={form.org}
          onChange={(e) => setForm((f) => ({ ...f, org: e.target.value }))}
          required
          placeholder="Brgy. Katipunan Council / M'lang MAO / Coop"
        />
      </Field>
      <Button type="submit" size="lg" className="w-full">
        Continue
      </Button>
    </form>
  );
}

export default function Onboarding({ initialRole }) {
  const [role, setRole] = useState(ROLE_CHOICES.some((c) => c.role === initialRole) ? initialRole : null);
  const done = () => navigate("/dashboard");

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-brand-900 via-brand-900 to-brand-950 px-4 py-8 sm:py-12">
      <button type="button" onClick={() => navigate("/")} className="mx-auto mb-8 flex items-center gap-2.5 text-white">
        <LeafMark className="h-9 w-9 text-brand-300" />
        <span className="text-left">
          <span className="block text-2xl font-extrabold tracking-tight">AgriConnect</span>
          <span className="block text-xs text-harvest-200">Farm Inputs, Closer to You.</span>
        </span>
      </button>

      <Card className="mx-auto w-full max-w-lg p-6 sm:p-8">
        {!role ? (
          <div>
            <h1 className="text-xl font-extrabold text-stone-900">How will you use AgriConnect?</h1>
            <p className="mt-1 text-sm text-stone-500">You can add another account later from the menu.</p>
            <div className="mt-5 space-y-3">
              {ROLE_CHOICES.map((c) => (
                <button
                  key={c.role}
                  type="button"
                  onClick={() => setRole(c.role)}
                  className="flex w-full items-start gap-4 rounded-2xl border border-stone-200 p-4 text-left transition hover:border-brand-400 hover:bg-brand-50/60"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                    <c.icon className="h-6 w-6" />
                  </span>
                  <span>
                    <span className="block font-bold text-stone-900">{c.title}</span>
                    <span className="mt-0.5 block text-sm text-stone-500">{c.body}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <button type="button" onClick={() => setRole(null)} className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-stone-500 hover:text-stone-800">
              <ArrowLeftIcon className="h-4 w-4" /> Back
            </button>
            {role === "farmer" && <FarmerForm onDone={done} />}
            {role === "supplier" && <SupplierForm onDone={done} />}
            {role === "staff" && <StaffForm onDone={done} />}
          </div>
        )}
      </Card>

      <ul className="mx-auto mt-8 flex max-w-lg flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-brand-100/70">
        {["Tagalog, Bisaya & English", "Order by SMS or Messenger", "Verified farmers & suppliers"].map((t) => (
          <li key={t} className={cx("flex items-center gap-1.5")}>
            <CheckIcon className="h-3.5 w-3.5 text-brand-300" /> {t}
          </li>
        ))}
      </ul>
    </div>
  );
}
