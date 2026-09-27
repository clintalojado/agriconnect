import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { navigate } from "../lib/router";
import { setIdentity, signOut, useSession } from "../lib/session";
import { useProfile } from "../lib/profile.jsx";
import { Alert, Button, Card, CardHeader, Field, Input, PageHeader, Skeleton, formatRelative } from "../components/ui.jsx";
import { StatusBadge, VERIFICATION_STATUS } from "../components/status.jsx";
import { BarangayInput } from "../components/BarangayInput.jsx";
import { LogOutIcon, MessengerIcon, PhoneIcon, ShieldCheckIcon, SmsIcon, SproutIcon, StoreIcon } from "../components/icons.jsx";

function PhoneVerification({ farmer, onVerified }) {
  const [otp, setOtp] = useState(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!farmer.phone_number) return <p className="text-sm text-stone-500">Add a mobile number to receive SMS updates.</p>;
  if (farmer.phone_verified) {
    return (
      <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-700">
        <ShieldCheckIcon className="h-4 w-4" /> {farmer.phone_number} is confirmed
      </p>
    );
  }

  async function send() {
    setError(null);
    setBusy(true);
    try {
      setOtp(await apiClient.post(`/farmers/${farmer.id}/otp`));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiClient.post(`/farmers/${farmer.id}/otp/verify`, { code });
      onVerified();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {!otp ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-stone-600">{farmer.phone_number} isn't confirmed yet.</span>
          <Button size="sm" onClick={send} loading={busy}>
            Text me a code
          </Button>
        </div>
      ) : (
        <form onSubmit={verify} className="space-y-2">
          {otp.dev_code && (
            <p className="text-xs text-stone-500">
              Development mode code: <strong className="tracking-widest">{otp.dev_code}</strong>
            </p>
          )}
          <div className="flex gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="6-digit code"
              className="max-w-[10rem] text-center tracking-widest"
            />
            <Button type="submit" loading={busy} disabled={code.length !== 6}>
              Confirm
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function FarmerSettings() {
  const { profile, refresh } = useProfile();
  const [form, setForm] = useState(null);
  const [records, setRecords] = useState([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!profile) return;
    setForm({ name: profile.name, phone_number: profile.phone_number || "", barangay: profile.barangay, municipality: profile.municipality });
    apiClient.get(`/farmers/${profile.id}/verification`).then(setRecords).catch(() => {});
  }, [profile]);

  if (!profile || !form) return <Skeleton className="h-80 rounded-3xl" />;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await apiClient.patch(`/farmers/${profile.id}`, form);
      setIdentity("farmer", { id: updated.id, name: updated.name });
      await refresh();
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <CardHeader icon={ShieldCheckIcon} title="Verification" subtitle="Checked by your barangay, LGU, or cooperative" action={<StatusBadge map={VERIFICATION_STATUS} status={profile.verification_status} />} />
        {records.length > 0 && (
          <ul className="mt-4 space-y-2 text-sm">
            {records.map((r) => (
              <li key={r.id} className="rounded-xl bg-stone-50 px-3 py-2">
                <span className="font-semibold capitalize">{r.decision.replace("_", " ")}</span> by {r.verifier_name} · {formatRelative(r.created_at)}
                {r.note && <p className="text-stone-600">“{r.note}”</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="p-5">
        <CardHeader icon={SproutIcon} title="Profile" />
        <form onSubmit={save} className="mt-4 space-y-3.5">
          {error && <Alert tone="error">{error}</Alert>}
          {saved && <Alert tone="success">Saved.</Alert>}
          <Field label="Full name">
            <Input value={form.name} onChange={set("name")} required />
          </Field>
          <Field label="Mobile number">
            <Input value={form.phone_number} onChange={set("phone_number")} type="tel" placeholder="09XX XXX XXXX" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Barangay">
              <BarangayInput value={form.barangay} onChange={set("barangay")} required />
            </Field>
            <Field label="Municipality">
              <Input value={form.municipality} onChange={set("municipality")} required />
            </Field>
          </div>
          <Button type="submit" loading={busy}>
            Save changes
          </Button>
        </form>
      </Card>
      <Card className="p-5">
        <CardHeader icon={PhoneIcon} title="Mobile number" subtitle="Confirmed numbers get SMS updates on quotes and deliveries" />
        <div className="mt-4">
          <PhoneVerification farmer={profile} onVerified={refresh} />
        </div>
      </Card>
      <Card className="p-5">
        <CardHeader icon={SmsIcon} title="Order without the app" />
        <div className="mt-3 space-y-2 text-sm text-stone-600">
          <p className="flex items-center gap-2">
            <SmsIcon className="h-4 w-4 text-harvest-500" /> Text your order to the AgriConnect number, e.g. <code className="rounded bg-stone-100 px-1.5">5 sako urea next week</code>
          </p>
          <p className="flex items-center gap-2">
            <MessengerIcon className="h-4 w-4 text-sky-600" /> Or message the AgriConnect Facebook page.
          </p>
          <p>
            Reply <code className="rounded bg-stone-100 px-1.5">OO</code> to confirm, <code className="rounded bg-stone-100 px-1.5">STATUS</code> to check your requests.
          </p>
        </div>
      </Card>
    </div>
  );
}

function SupplierSettings() {
  const { profile, refresh } = useProfile();
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!profile) return;
    setForm({
      name: profile.name,
      contact_person: profile.contact_person || "",
      phone: profile.phone || "",
      barangay: profile.barangay || "",
      municipality: profile.municipality || "",
      coverage_barangays: profile.coverage_barangays || "",
    });
  }, [profile]);

  if (!profile || !form) return <Skeleton className="h-80 rounded-3xl" />;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await apiClient.patch(`/suppliers/${profile.id}`, form);
      setIdentity("supplier", { id: updated.id, name: updated.name });
      await refresh();
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <CardHeader
          icon={ShieldCheckIcon}
          title="Verification"
          subtitle="Only verified stores appear in the marketplace and can quote"
          action={<StatusBadge map={VERIFICATION_STATUS} status={profile.verified ? "verified" : "pending"} />}
        />
      </Card>
      <Card className="p-5">
        <CardHeader icon={StoreIcon} title="Store profile" />
        <form onSubmit={save} className="mt-4 space-y-3.5">
          {error && <Alert tone="error">{error}</Alert>}
          {saved && <Alert tone="success">Saved.</Alert>}
          <Field label="Store name">
            <Input value={form.name} onChange={set("name")} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact person">
              <Input value={form.contact_person} onChange={set("contact_person")} />
            </Field>
            <Field label="Mobile number">
              <Input value={form.phone} onChange={set("phone")} type="tel" />
            </Field>
            <Field label="Barangay">
              <BarangayInput value={form.barangay} onChange={set("barangay")} />
            </Field>
            <Field label="Municipality">
              <Input value={form.municipality} onChange={set("municipality")} />
            </Field>
          </div>
          <Field label="Barangays you deliver to" hint="(comma-separated — used for “Nearby” requests)">
            <Input value={form.coverage_barangays} onChange={set("coverage_barangays")} />
          </Field>
          <Button type="submit" loading={busy}>
            Save changes
          </Button>
        </form>
      </Card>
    </div>
  );
}

function StaffSettings() {
  const { staff } = useSession();
  const [form, setForm] = useState({ name: staff?.name || "", org: staff?.org || "" });
  const [saved, setSaved] = useState(false);
  return (
    <Card className="p-5">
      <CardHeader icon={ShieldCheckIcon} title="Staff profile" subtitle="Shown on the verification records you create" />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setIdentity("staff", { id: "staff", name: form.name.trim(), org: form.org.trim() });
          setSaved(true);
        }}
        className="mt-4 space-y-3.5"
      >
        {saved && <Alert tone="success">Saved.</Alert>}
        <Field label="Your name">
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
        </Field>
        <Field label="Office">
          <Input value={form.org} onChange={(e) => setForm((f) => ({ ...f, org: e.target.value }))} required />
        </Field>
        <Button type="submit">Save</Button>
      </form>
    </Card>
  );
}

export default function Settings() {
  const { role } = useSession();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={role === "staff" ? "Settings" : "Profile & settings"} />
      {role === "farmer" && <FarmerSettings />}
      {role === "supplier" && <SupplierSettings />}
      {role === "staff" && <StaffSettings />}
      <Button
        variant="dangerGhost"
        icon={LogOutIcon}
        className="mt-6"
        onClick={() => {
          signOut(role);
          navigate("/");
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
