import { useState } from "react";
import { apiClient } from "../api/client";
import { useNavigate } from "../lib/navigation";
import { useCall } from "../calls/CallProvider.jsx";
import { useToast } from "../components/ui.jsx";

function busyKey(kind, pair) {
  return `${kind}:${pair.farmer_id}:${pair.supplier_id}`;
}

/**
 * Open a chat or start a voice call with the other side of a deal.
 * `pair` is { farmer_id, supplier_id, offer_id? }.
 */
export function useContact() {
  const navigate = useNavigate();
  const { startCall } = useCall();
  const toast = useToast();
  const [busy, setBusy] = useState(null);

  async function withConversation(kind, pair, then) {
    if (busy) return;
    setBusy(busyKey(kind, pair));
    try {
      const conversation = await apiClient.post("/conversations", pair);
      await then(conversation);
    } catch (err) {
      toast({ title: "Couldn't open the conversation", body: err.message, tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  return {
    /** True while this action for this farmer/supplier pair is in progress. */
    isBusy: (kind, pair) => busy === busyKey(kind, pair),
    message: (pair) => withConversation("message", pair, (c) => navigate(`/messages/${c.id}`)),
    call: (pair) => withConversation("call", pair, (c) => startCall(c)),
  };
}
