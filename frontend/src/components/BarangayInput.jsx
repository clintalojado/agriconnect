import { useEffect, useId, useState } from "react";
import { apiClient } from "../api/client";
import { Input } from "./ui";

// Fetched once per page load; the list rarely changes.
let cached = null;
function loadBarangays() {
  cached ??= apiClient.get("/locations").then((r) => r.barangays).catch(() => []);
  return cached;
}

/** Text input that suggests M'lang barangays but still accepts any barangay (other towns). */
export function BarangayInput(props) {
  const listId = useId();
  const [barangays, setBarangays] = useState([]);

  useEffect(() => {
    let alive = true;
    loadBarangays().then((list) => alive && setBarangays(list));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      <Input list={listId} autoComplete="off" {...props} />
      <datalist id={listId}>
        {barangays.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
    </>
  );
}
