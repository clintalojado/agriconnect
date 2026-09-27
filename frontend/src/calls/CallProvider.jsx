import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { apiClient } from "../api/client";
import { useSession } from "../lib/session";
import { useRealtimeEvent } from "../lib/realtime.jsx";
import { Avatar, cx, useToast } from "../components/ui.jsx";
import { MicIcon, MicOffIcon, PhoneIcon, PhoneOffIcon } from "../components/icons.jsx";

// In-browser voice calls. Audio goes peer-to-peer over WebRTC; the backend
// relays the offer/answer/ICE messages over the realtime stream and keeps the
// call log. A public STUN server is enough on most networks; strict NATs
// would also need a TURN server added to ICE_SERVERS.
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];
const RING_TIMEOUT_MS = 30000;

const END_LABELS = {
  declined: "Call declined",
  missed: "No answer",
  ended: "Call ended",
  failed: "Call failed",
};

const CallContext = createContext({ startCall: async () => {}, call: null });

export function useCall() {
  return useContext(CallContext);
}

function createRinger(kind) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return { stop() {} };
  const ctx = new Ctx();
  let stopped = false;
  const beep = () => {
    if (stopped) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const length = kind === "incoming" ? 0.4 : 1.0;
    osc.frequency.value = kind === "incoming" ? 880 : 425;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + length);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + length + 0.05);
  };
  beep();
  const interval = setInterval(beep, kind === "incoming" ? 1100 : 3000);
  return {
    stop() {
      stopped = true;
      clearInterval(interval);
      ctx.close().catch(() => {});
    },
  };
}

async function getMicrophone() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser can't make voice calls. Try Chrome, Edge, Firefox, or Safari.");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    throw new Error("Microphone access is blocked. Allow the microphone for this site to make calls.");
  }
}

export function CallProvider({ children }) {
  const { role } = useSession();
  const toast = useToast();
  const [call, setCallState] = useState(null);

  const callRef = useRef(null);
  const pcRef = useRef(null);
  const streamRef = useRef(null);
  const remoteOfferRef = useRef(null);
  const pendingIceRef = useRef([]);
  const ringerRef = useRef(null);
  const timeoutRef = useRef(null);
  const clearRef = useRef(null);
  const audioRef = useRef(null);

  const setCall = useCallback((updater) => {
    setCallState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      callRef.current = next;
      return next;
    });
  }, []);

  const stopRinger = () => {
    ringerRef.current?.stop();
    ringerRef.current = null;
  };

  const cleanup = useCallback(() => {
    stopRinger();
    clearTimeout(timeoutRef.current);
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    remoteOfferRef.current = null;
    pendingIceRef.current = [];
    if (audioRef.current) audioRef.current.srcObject = null;
  }, []);

  const finish = useCallback(
    (reason, { linger = 2500 } = {}) => {
      cleanup();
      setCall((prev) => (prev ? { ...prev, phase: "ended", endReason: reason } : prev));
      clearTimeout(clearRef.current);
      clearRef.current = setTimeout(() => setCall(null), linger);
    },
    [cleanup, setCall]
  );

  useEffect(() => cleanup, [cleanup]);

  const postStatus = (id, status) => apiClient.post(`/calls/${id}/status`, { status }).catch(() => {});
  const sendSignal = (id, data) => apiClient.post(`/calls/${id}/signal`, { from_type: role, data }).catch(() => {});

  async function flushPendingIce() {
    const pc = pcRef.current;
    if (!pc) return;
    for (const candidate of pendingIceRef.current.splice(0)) {
      await pc.addIceCandidate(candidate).catch(() => {});
    }
  }

  function createPeer(callId, stream) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal(callId, { type: "candidate", candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      if (audioRef.current) {
        audioRef.current.srcObject = e.streams[0];
        audioRef.current.play().catch(() => {});
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setCall((prev) => (prev ? { ...prev, phase: "active", answeredAt: prev.answeredAt || Date.now() } : prev));
      } else if (pc.connectionState === "failed") {
        postStatus(callId, "failed");
        finish("Connection failed — check your internet and try again");
      }
    };
    pcRef.current = pc;
    return pc;
  }

  const startCall = useCallback(
    async (conversation) => {
      if (callRef.current && callRef.current.phase !== "ended") {
        toast({ title: "You're already on a call", tone: "error" });
        return;
      }
      if (!role) {
        toast({ title: "Set up your profile first", tone: "error" });
        return;
      }
      clearTimeout(clearRef.current);
      const peerName = role === "farmer" ? conversation.supplier_name : conversation.farmer_name;
      const peerPhone = role === "farmer" ? conversation.supplier_phone : conversation.farmer_phone;
      setCall({ id: null, conversationId: conversation.id, direction: "outgoing", phase: "dialing", peerName, peerPhone, muted: false });

      let stream;
      try {
        stream = await getMicrophone();
      } catch (error) {
        setCall(null);
        toast({ title: "Can't start the call", body: error.message, tone: "error" });
        return;
      }
      streamRef.current = stream;

      let started;
      try {
        started = await apiClient.post("/calls/start", { conversation_id: conversation.id, caller_type: role });
      } catch (error) {
        cleanup();
        setCall(null);
        toast({ title: "Can't start the call", body: error.message, tone: "error" });
        return;
      }

      if (!started.callee_online) {
        finish(`${peerName} isn't online right now. We texted them that you called.`, { linger: 7000 });
        return;
      }

      const callId = started.call.id;
      setCall((prev) => ({ ...prev, id: callId, phase: "ringing" }));
      ringerRef.current = createRinger("outgoing");

      try {
        const pc = createPeer(callId, stream);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal(callId, { type: "offer", sdp: offer.sdp });
      } catch {
        postStatus(callId, "failed");
        finish("Call failed");
        return;
      }

      timeoutRef.current = setTimeout(() => {
        if (callRef.current?.id === callId && callRef.current.phase === "ringing") {
          postStatus(callId, "missed");
          finish("No answer");
        }
      }, RING_TIMEOUT_MS);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [role, toast, cleanup, finish, setCall]
  );

  useRealtimeEvent("call:incoming", (data) => {
    if (callRef.current && callRef.current.phase !== "ended") return; // busy — caller's ring times out
    clearTimeout(clearRef.current);
    setCall({
      id: data.call.id,
      conversationId: data.conversation_id,
      direction: "incoming",
      phase: "ringing",
      peerName: data.caller_name,
      muted: false,
    });
    ringerRef.current = createRinger("incoming");
    timeoutRef.current = setTimeout(() => {
      if (callRef.current?.id === data.call.id && callRef.current.phase === "ringing") finish("Missed call");
    }, RING_TIMEOUT_MS + 5000);
  });

  useRealtimeEvent("call:signal", async ({ call_id, from_type, data }) => {
    const current = callRef.current;
    if (!current || current.id !== call_id || from_type === role) return;
    const pc = pcRef.current;
    if (data.type === "offer") {
      remoteOfferRef.current = data;
    } else if (data.type === "answer" && pc) {
      await pc.setRemoteDescription({ type: "answer", sdp: data.sdp }).catch(() => {});
      await flushPendingIce();
    } else if (data.type === "candidate") {
      if (pc?.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
      else pendingIceRef.current.push(data.candidate);
    }
  });

  useRealtimeEvent("call:update", ({ call: updated }) => {
    const current = callRef.current;
    if (!current || current.id !== updated.id || current.phase === "ended") return;
    if (updated.status === "answered") {
      stopRinger();
      clearTimeout(timeoutRef.current);
      setCall((prev) => (prev.phase === "active" ? prev : { ...prev, phase: "connecting" }));
    } else if (END_LABELS[updated.status]) {
      finish(END_LABELS[updated.status]);
    }
  });

  async function waitForOffer(timeoutMs) {
    const start = Date.now();
    while (!remoteOfferRef.current && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return remoteOfferRef.current;
  }

  async function accept() {
    const current = callRef.current;
    if (!current) return;
    stopRinger();
    clearTimeout(timeoutRef.current);
    setCall((prev) => ({ ...prev, phase: "connecting" }));

    let stream;
    try {
      stream = await getMicrophone();
    } catch (error) {
      postStatus(current.id, "declined");
      finish(error.message, { linger: 5000 });
      return;
    }
    streamRef.current = stream;

    try {
      const pc = createPeer(current.id, stream);
      const offer = await waitForOffer(5000);
      if (!offer) throw new Error("no offer");
      await pc.setRemoteDescription({ type: "offer", sdp: offer.sdp });
      await flushPendingIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal(current.id, { type: "answer", sdp: answer.sdp });
      postStatus(current.id, "answered");
    } catch {
      postStatus(current.id, "failed");
      finish("Couldn't connect the call");
    }
  }

  function decline() {
    const current = callRef.current;
    if (!current) return;
    postStatus(current.id, "declined");
    finish("Declined", { linger: 1200 });
  }

  function hangUp() {
    const current = callRef.current;
    if (!current) return;
    if (current.id) postStatus(current.id, "ended");
    finish("Call ended");
  }

  function toggleMute() {
    const stream = streamRef.current;
    if (!stream) return;
    const muted = !callRef.current?.muted;
    stream.getAudioTracks().forEach((t) => (t.enabled = !muted));
    setCall((prev) => ({ ...prev, muted }));
  }

  return (
    <CallContext.Provider value={{ startCall, call }}>
      {children}
      <audio ref={audioRef} autoPlay playsInline className="hidden" />
      {call && <CallOverlay call={call} onAccept={accept} onDecline={decline} onHangUp={hangUp} onToggleMute={toggleMute} />}
    </CallContext.Provider>
  );
}

function useElapsed(since) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!since) return undefined;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [since]);
  if (!since) return null;
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function RoundButton({ tone, label, icon: Icon, onClick, active }) {
  const tones = {
    accept: "bg-brand-500 text-white hover:bg-brand-600",
    danger: "bg-red-500 text-white hover:bg-red-600",
    neutral: active ? "bg-white text-stone-900" : "bg-white/15 text-white hover:bg-white/25",
  };
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={cx("flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-colors", tones[tone])}
      >
        <Icon className="h-6 w-6" />
      </button>
      <span className="text-xs font-medium text-white/80">{label}</span>
    </div>
  );
}

function CallOverlay({ call, onAccept, onDecline, onHangUp, onToggleMute }) {
  const elapsed = useElapsed(call.phase === "active" ? call.answeredAt : null);
  const statusText = {
    dialing: "Starting call…",
    ringing: call.direction === "incoming" ? "Incoming voice call" : "Ringing…",
    connecting: "Connecting…",
    active: elapsed || "Connected",
    ended: call.endReason,
  }[call.phase];

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-80">
      <div className="animate-fade-in-up overflow-hidden rounded-3xl bg-gradient-to-br from-brand-800 via-brand-900 to-brand-950 p-6 text-white shadow-lift">
        <div className="flex flex-col items-center text-center">
          <span className={cx("rounded-full", call.phase === "ringing" && "animate-ring-pulse")}>
            <Avatar name={call.peerName || "?"} size="xl" />
          </span>
          <p className="mt-4 text-lg font-bold">{call.peerName}</p>
          <p className={cx("mt-1 text-sm", call.phase === "ended" ? "text-harvest-200" : "text-brand-100/80")} aria-live="polite">
            {statusText}
          </p>
          {call.phase === "ended" && call.peerPhone && call.direction === "outgoing" && (
            <a
              href={`tel:${call.peerPhone}`}
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/25"
            >
              <PhoneIcon className="h-4 w-4" /> Call {call.peerPhone} by phone
            </a>
          )}
        </div>

        {call.phase !== "ended" && (
          <div className="mt-6 flex items-start justify-center gap-8">
            {call.direction === "incoming" && call.phase === "ringing" ? (
              <>
                <RoundButton tone="danger" label="Decline" icon={PhoneOffIcon} onClick={onDecline} />
                <RoundButton tone="accept" label="Answer" icon={PhoneIcon} onClick={onAccept} />
              </>
            ) : (
              <>
                <RoundButton
                  tone="neutral"
                  label={call.muted ? "Unmute" : "Mute"}
                  icon={call.muted ? MicOffIcon : MicIcon}
                  onClick={onToggleMute}
                  active={call.muted}
                />
                <RoundButton tone="danger" label="End" icon={PhoneOffIcon} onClick={onHangUp} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
