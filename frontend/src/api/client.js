// In a production build the backend serves the app, so the API is on the same origin.
export const BASE_URL =
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? "/api" : "http://localhost:4000/api");

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch {
    throw new Error("Can't reach the AgriConnect server. Check your connection and try again.");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(body.message || `Request failed: ${res.status}`);
    error.status = res.status;
    throw error;
  }

  return res.json();
}

export const apiClient = {
  get: (path) => request(path),
  post: (path, data) => request(path, { method: "POST", body: JSON.stringify(data ?? {}) }),
  patch: (path, data) => request(path, { method: "PATCH", body: JSON.stringify(data ?? {}) }),
  put: (path, data) => request(path, { method: "PUT", body: JSON.stringify(data ?? {}) }),
  delete: (path) => request(path, { method: "DELETE" }),
};
