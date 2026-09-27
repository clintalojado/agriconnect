import { useEffect, useState } from "react";

// Who is using this browser tab. Signed-in identities are remembered per
// browser (localStorage); the *active role* is per tab (sessionStorage), so
// one tab can act as a farmer and another as a supplier or staff — handy for
// demoing the whole flow on one machine.
//
// Roles: farmer { id, name, … } · supplier { id, name, … } · staff { name, org }
// (staff = barangay / LGU / cooperative officer; no database record).

export const ROLES = ["farmer", "supplier", "staff"];
const IDENTITY_KEYS = {
  farmer: "agriconnect:farmer_identity",
  supplier: "agriconnect:supplier_identity",
  staff: "agriconnect:staff_identity",
};
const ROLE_KEY = "agriconnect:active_role";
const CHANGE_EVENT = "agriconnect:session";

function read(storage, key) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(storage, key, value) {
  try {
    if (value == null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private browsing) — session just won't persist
  }
}

export function getIdentity(role) {
  return read(localStorage, IDENTITY_KEYS[role]);
}

function snapshot() {
  const identities = Object.fromEntries(ROLES.map((r) => [r, getIdentity(r)]));
  let role = read(sessionStorage, ROLE_KEY);
  if (!role || !identities[role]) role = ROLES.find((r) => identities[r]) || null;
  return { ...identities, role, me: role ? identities[role] : null };
}

function emit() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Save (or clear, with null) the identity for a role; saving makes it this tab's active role. */
export function setIdentity(role, identity) {
  write(localStorage, IDENTITY_KEYS[role], identity);
  if (identity) write(sessionStorage, ROLE_KEY, role);
  emit();
}

export function setActiveRole(role) {
  write(sessionStorage, ROLE_KEY, role);
  emit();
}

export function signOut(role) {
  write(localStorage, IDENTITY_KEYS[role], null);
  write(sessionStorage, ROLE_KEY, null);
  emit();
}

/** { farmer, supplier, staff, role, me } — re-renders when any of it changes. */
export function useSession() {
  const [session, setSession] = useState(snapshot);
  useEffect(() => {
    const update = () => setSession(snapshot());
    window.addEventListener(CHANGE_EVENT, update);
    window.addEventListener("storage", update); // other tabs signing in/out
    return () => {
      window.removeEventListener(CHANGE_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return session;
}
