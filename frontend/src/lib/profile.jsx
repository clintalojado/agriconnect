import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { setIdentity, useSession } from "./session";
import { useRealtimeEvent } from "./realtime.jsx";

// The signed-in farmer's or supplier's live profile (verification status,
// ratings, …), refreshed when a verification notification arrives. If the
// record no longer exists (database reset), the stale identity is cleared.

const ProfileContext = createContext({ profile: null, loading: false, refresh: () => {} });

export function ProfileProvider({ children }) {
  const { role, me } = useSession();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!me?.id || (role !== "farmer" && role !== "supplier")) {
      setProfile(null);
      return;
    }
    setLoading(true);
    try {
      const data = await apiClient.get(`/${role}s/${me.id}`);
      setProfile(data);
    } catch (err) {
      if (err.status === 404) setIdentity(role, null);
    } finally {
      setLoading(false);
    }
  }, [role, me?.id]);

  useEffect(() => {
    setProfile(null);
    refresh();
  }, [refresh]);

  useRealtimeEvent("notification", (n) => {
    if (n.kind === "verification") refresh();
  });

  return <ProfileContext.Provider value={{ profile, loading, refresh }}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  return useContext(ProfileContext);
}
