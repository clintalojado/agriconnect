import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { useSession } from "../lib/session";
import { useRealtimeEvent } from "../lib/realtime.jsx";
import { Alert, Avatar, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Segmented, SkeletonList, Textarea, formatRelative } from "../components/ui.jsx";
import { StatusBadge, VERIFICATION_STATUS } from "../components/status.jsx";
import { MessengerIcon, PhoneIcon, PinIcon, ShieldCheckIcon, SmsIcon } from "../components/icons.jsx";
import SupplierDirectory from "../suppliers/SupplierDirectory.jsx";

const DECISIONS = {
  approved: { title: "Approve farmer", button: "Approve", tone: "primary" },
  more_info: { title: "Request more information", button: "Send request", tone: "warning" },
  rejected: { title: "Reject farmer", button: "Reject", tone: "danger" },
};

function DecisionModal({ farmer, decision, onClose, onDone }) {
  const { staff } = useSession();
  const [verifier, setVerifier] = useState(staff ? `${staff.name}${staff.org ? `, ${staff.org}` : ""}` : "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const meta = DECISIONS[decision];

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiClient.post(`/farmers/${farmer.id}/verification`, { decision, verifier_name: verifier, note });
      onDone();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={meta.title} subtitle={`${farmer.name} · Brgy. ${farmer.barangay}, ${farmer.municipality}`}>
      <form onSubmit={submit} className="space-y-3.5">
        {error && <Alert tone="error">{error}</Alert>}
        {decision === "approved" && <p className="text-sm text-stone-600">Approving releases the farmer's held requests to suppliers and texts them the news.</p>}
        <Field label="Verified by">
          <Input value={verifier} onChange={(e) => setVerifier(e.target.value)} required />
        </Field>
        <Field label={decision === "approved" ? "Note (optional)" : "What should the farmer do?"}>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} required={decision !== "approved"} placeholder={decision === "approved" ? "e.g. Listed in the RSBSA" : "e.g. Please visit the barangay hall with a valid ID"} />
        </Field>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant={meta.tone} className="flex-1" loading={busy}>
            {meta.button}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function FarmerQueue() {
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [deciding, setDeciding] = useState(null); // { farmer, decision }

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    apiClient
      .get(`/farmers?${params}`)
      .then(setRows)
      .catch(() => setRows([]));
  }, [status, q]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);
  useRealtimeEvent("verification", load);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, barangay, or phone" className="sm:max-w-xs" />
        <div className="flex flex-wrap gap-2">
          {["pending", "more_info", "verified", "rejected", "all"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={
                status === s
                  ? "rounded-full bg-brand-700 px-3.5 py-1.5 text-sm font-semibold text-white"
                  : "rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"
              }
            >
              {s === "all" ? "All" : VERIFICATION_STATUS[s].label}
            </button>
          ))}
        </div>
      </div>
      {rows === null ? (
        <SkeletonList rows={3} />
      ) : rows.length === 0 ? (
        <EmptyState icon={ShieldCheckIcon} title="Nobody here" description={status === "pending" ? "All farmer profiles are reviewed." : "No farmers match."} />
      ) : (
        <div className="space-y-3">
          {rows.map((f) => (
            <Card key={f.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={f.name} size="lg" />
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-bold text-stone-900">
                    {f.name} <StatusBadge map={VERIFICATION_STATUS} status={f.verification_status} dot={false} />
                  </p>
                  <p className="flex items-center gap-1 text-sm text-stone-600">
                    <PinIcon className="h-3.5 w-3.5" /> Brgy. {f.barangay}, {f.municipality}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-3 text-xs text-stone-500">
                    {f.phone_number && (
                      <span className="flex items-center gap-1">
                        <PhoneIcon className="h-3 w-3" /> {f.phone_number} {f.phone_verified ? "✓ confirmed" : "(not confirmed)"}
                      </span>
                    )}
                    {f.messenger_psid && (
                      <span className="flex items-center gap-1">
                        <MessengerIcon className="h-3 w-3 text-sky-600" /> Messenger
                      </span>
                    )}
                    {!f.phone_number && !f.messenger_psid && (
                      <span className="flex items-center gap-1">
                        <SmsIcon className="h-3 w-3" /> App only
                      </span>
                    )}
                    <span>
                      {f.request_count} request{f.request_count === 1 ? "" : "s"}
                    </span>
                    {f.created_at && <span>joined {formatRelative(f.created_at)}</span>}
                  </p>
                  {f.last_verification_note && <p className="mt-1 text-xs italic text-stone-500">Last note: “{f.last_verification_note}”</p>}
                </div>
              </div>
              {f.verification_status !== "verified" && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setDeciding({ farmer: f, decision: "approved" })}>
                    Approve
                  </Button>
                  <Button size="sm" variant="warning" onClick={() => setDeciding({ farmer: f, decision: "more_info" })}>
                    More info
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeciding({ farmer: f, decision: "rejected" })}>
                    Reject
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      {deciding && <DecisionModal farmer={deciding.farmer} decision={deciding.decision} onClose={() => setDeciding(null)} onDone={load} />}
    </div>
  );
}

export default function Verification() {
  const [tab, setTab] = useState("farmers");
  return (
    <div>
      {tab === "farmers" && (
        <PageHeader
          title="Verification"
          description="Barangay / LGU / cooperative review. Farmers' requests reach suppliers only after approval; only verified stores can quote."
        />
      )}
      <Segmented
        className="mb-5"
        value={tab}
        onChange={setTab}
        options={[
          { value: "farmers", label: "Farmers" },
          { value: "suppliers", label: "Suppliers" },
        ]}
      />
      {tab === "farmers" ? <FarmerQueue /> : <SupplierDirectory query={{}} />}
    </div>
  );
}
