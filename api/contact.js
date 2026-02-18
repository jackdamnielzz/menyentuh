const MAX_BODY_SIZE = 1024 * 1024;

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
};

const escapeHtml = (value = "") =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > MAX_BODY_SIZE) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

const parseBody = async (req) => {
  const raw = await readBody(req);
  if (!raw) return {};
  const contentType = req.headers["content-type"] || "";

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(raw);
    } catch (error) {
      return {};
    }
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(raw);
    return Object.fromEntries(params.entries());
  }

  return {};
};

const isValidEmail = (value = "") =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return sendJson(res, 500, { ok: false, error: "Missing mail configuration" });
  }

  let data = {};
  try {
    data = await parseBody(req);
  } catch (error) {
    return sendJson(res, 413, { ok: false, error: "Request body too large" });
  }

  if (data._honey) {
    return sendJson(res, 200, { ok: true });
  }

  const name = (data.naam || "").trim();
  const email = (data.email || "").trim();
  const phone = (data.telefoon || "").trim();
  const subject = (data.onderwerp || "").trim();
  const message = (data.bericht || "").trim();

  if (!name) {
    return sendJson(res, 400, { ok: false, error: "Naam ontbreekt." });
  }
  if (!email || !isValidEmail(email)) {
    return sendJson(res, 400, { ok: false, error: "Vul een geldig e-mailadres in." });
  }
  if (!subject) {
    return sendJson(res, 400, { ok: false, error: "Kies een onderwerp." });
  }
  if (!message) {
    return sendJson(res, 400, { ok: false, error: "Schrijf een kort bericht." });
  }

  const text = [
    `Naam: ${name}`,
    `E-mail: ${email}`,
    `Telefoon: ${phone || "-"}`,
    `Onderwerp: ${subject}`,
    `Bericht: ${message}`,
  ].join("\n");

  const html = `
    <p><strong>Naam:</strong> ${escapeHtml(name)}</p>
    <p><strong>E-mail:</strong> ${escapeHtml(email)}</p>
    <p><strong>Telefoon:</strong> ${escapeHtml(phone || "-")}</p>
    <p><strong>Onderwerp:</strong> ${escapeHtml(subject)}</p>
    <p><strong>Bericht:</strong><br/>${escapeHtml(message).replace(/\n/g, "<br/>")}</p>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Menyentuh <no-reply@menyentuh.nl>",
      to: ["info@menyentuh.nl"],
      reply_to: email,
      subject: `Nieuw contactbericht via Menyentuh.nl - ${subject}`,
      text,
      html,
    }),
  });

  if (!response.ok) {
    let errorMessage = "Er ging iets mis met versturen.";
    try {
      const errorBody = await response.json();
      errorMessage = errorBody?.message || errorMessage;
    } catch (error) {
      // ignore parse errors
    }
    return sendJson(res, 502, { ok: false, error: errorMessage });
  }

  return sendJson(res, 200, { ok: true });
};
