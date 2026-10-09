// Minimal fixed-window rate limiter, keyed by client IP.
// State lives in the memory of a warm serverless instance, so it is a speed
// bump against bursts (form spam, password guessing), not a hard guarantee:
// a cold start or a second instance starts with a clean slate.

const buckets = new Map();

const clientIp = (req) => {
  const forwarded = String(req.headers["x-forwarded-for"] || "");
  return (
    forwarded.split(",")[0].trim() ||
    String(req.headers["x-real-ip"] || "") ||
    (req.socket && req.socket.remoteAddress) ||
    "unknown"
  );
};

/**
 * Count one hit for this request and report whether it is over the limit.
 * @param {object} req
 * @param {string} name     separate counter per endpoint/purpose
 * @param {number} limit    allowed hits per window
 * @param {number} windowMs window length in milliseconds
 * @returns {{ limited: boolean, retryAfter: number }} retryAfter in seconds
 */
const hit = (req, name, limit, windowMs) => {
  const now = Date.now();
  const key = `${name}:${clientIp(req)}`;
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;

  // Drop expired buckets now and then so the map cannot grow unbounded.
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }

  return {
    limited: bucket.count > limit,
    retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
  };
};

// True when this client has already used up `limit` hits in the current
// window of counter `name` (does not count a hit itself).
const isLimited = (req, name, limit) => {
  const bucket = buckets.get(`${name}:${clientIp(req)}`);
  return Boolean(bucket && bucket.resetAt > Date.now() && bucket.count >= limit);
};

// Apply a limit and, when exceeded, answer 429 with a Dutch message.
// Returns true when the request was rejected and handled.
const rejectIfLimited = (req, res, name, limit, windowMs) => {
  const { limited, retryAfter } = hit(req, name, limit, windowMs);
  if (!limited) return false;
  res.statusCode = 429;
  res.setHeader("Retry-After", String(retryAfter));
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(
    JSON.stringify({
      ok: false,
      error: "Te veel pogingen. Probeer het over een paar minuten opnieuw.",
    })
  );
  return true;
};

module.exports = { hit, isLimited, rejectIfLimited, clientIp };
