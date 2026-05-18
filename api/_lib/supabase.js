// Lightweight Supabase REST (PostgREST) client.
// Uses fetch only, so no npm dependency / package.json is required.

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const isConfigured = () => Boolean(SUPABASE_URL && SERVICE_KEY);

// Perform a request against the PostgREST endpoint.
// `path` is everything after /rest/v1/, e.g. "bookings?select=*&id=eq.123".
const sb = async (path, { method = "GET", body, prefer } = {}) => {
  if (!isConfigured()) {
    const err = new Error("Supabase is niet geconfigureerd op de server.");
    err.status = 500;
    throw err;
  }

  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const raw = await res.text();
  let data = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch (error) {
      data = raw;
    }
  }

  if (!res.ok) {
    const err = new Error(
      (data && data.message) || `Supabase-fout (${res.status})`
    );
    err.status = res.status;
    err.detail = data;
    throw err;
  }

  return data;
};

module.exports = { sb, isConfigured };
