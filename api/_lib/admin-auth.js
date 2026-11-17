// Device tokens for the admin dashboard.
//
// After one successful password login the server hands out a signed token
// that never expires, so the owner stays logged in on her phone (home-screen
// app) without typing the password again. The token is kept in an HttpOnly
// cookie (renewed on every request) and in the app's localStorage as backup.
//
// Revoking: the signing key is derived from BOOKING_ADMIN_PASSWORD (plus the
// optional BOOKING_ADMIN_SESSION_SECRET). Changing either one in Vercel
// invalidates every token that was ever issued.

const crypto = require("crypto");

const COOKIE_NAME = "mny_adm";
const COOKIE_PATH = "/api/booking/admin";
// Browsers cap cookie lifetime at ~400 days; the cookie is renewed on every
// request, so in practice it lives as long as the app is used now and then.
const COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

const b64url = (buf) =>
  Buffer.from(buf)
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const signingKey = (password) =>
  crypto
    .createHash("sha256")
    .update(
      `menyentuh-admin-v1:${process.env.BOOKING_ADMIN_SESSION_SECRET || ""}:${password}`
    )
    .digest();

const sign = (body, password) =>
  b64url(crypto.createHmac("sha256", signingKey(password)).update(body).digest());

const createToken = (password) => {
  const body = b64url(
    JSON.stringify({ v: 1, iat: Date.now(), n: crypto.randomBytes(8).toString("hex") })
  );
  return `${body}.${sign(body, password)}`;
};

const verifyToken = (token, password) => {
  if (typeof token !== "string" || !password) return false;
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  const expected = Buffer.from(sign(body, password));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
};

const readCookie = (req) => {
  const header = req.headers.cookie || "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
};

const setTokenCookie = (res, token) => {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=${COOKIE_PATH}; ` +
      `Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Strict`
  );
};

const clearTokenCookie = (res) => {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=${COOKIE_PATH}; Max-Age=0; HttpOnly; Secure; SameSite=Strict`
  );
};

module.exports = {
  createToken,
  verifyToken,
  readCookie,
  setTokenCookie,
  clearTokenCookie,
};
