import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { BASE_URL } from "../api/client";
import { useSession } from "./session";

// One Server-Sent Events stream per tab, subscribed as this tab's active role.
// Components listen with useRealtimeEvent("message", handler).

const EVENTS = ["message", "read", "notification", "call:incoming", "call:signal", "call:update", "inbound", "verification"];

const RealtimeContext = createContext({ subscribe: () => () => {}, connected: false });

function streamQuery(role, me) {
  if (role === "staff") return "staff=1";
  if ((role === "farmer" || role === "supplier") && me?.id) return `${role}=${me.id}`;
  return null;
}

export function RealtimeProvider({ children }) {
  const { role, me } = useSession();
  const listeners = useRef(new Map());
  const [connected, setConnected] = useState(false);
  const query = streamQuery(role, me);

  useEffect(() => {
    if (!query) {
      setConnected(false);
      return undefined;
    }
    const source = new EventSource(`${BASE_URL}/realtime/stream?${query}`);
    source.addEventListener("ready", () => setConnected(true));
    source.onerror = () => setConnected(false); // EventSource reconnects on its own

    for (const event of EVENTS) {
      source.addEventListener(event, (e) => {
        let data;
        try {
          data = JSON.parse(e.data);
        } catch {
          return;
        }
        listeners.current.get(event)?.forEach((fn) => fn(data));
      });
    }
    return () => {
      source.close();
      setConnected(false);
    };
  }, [query]);

  const subscribe = useCallback((event, fn) => {
    if (!listeners.current.has(event)) listeners.current.set(event, new Set());
    listeners.current.get(event).add(fn);
    return () => listeners.current.get(event)?.delete(fn);
  }, []);

  return <RealtimeContext.Provider value={{ subscribe, connected }}>{children}</RealtimeContext.Provider>;
}

/** Calls handler(data) for each `event` pushed by the server; always uses the latest handler. */
export function useRealtimeEvent(event, handler) {
  const { subscribe } = useContext(RealtimeContext);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => subscribe(event, (data) => handlerRef.current(data)), [event, subscribe]);
}

export function useRealtimeConnected() {
  return useContext(RealtimeContext).connected;
}
