// Shared helpers for the booking module: time math, validation and the
// core slot-generation algorithm that the public booking page relies on.

const WEEKDAY_NAMES = [
  "zondag",
  "maandag",
  "dinsdag",
  "woensdag",
  "donderdag",
  "vrijdag",
  "zaterdag",
];

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
};

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const isValidEmail = (value = "") =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());

const isValidDate = (value = "") => /^\d{4}-\d{2}-\d{2}$/.test(value);

// Normalise a "HH:MM" or "HH:MM:SS" string to "HH:MM".
const normTime = (value = "") => {
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const h = String(Math.min(23, parseInt(match[1], 10))).padStart(2, "0");
  return `${h}:${match[2]}`;
};

const toMinutes = (time) => {
  const t = normTime(time);
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

const fromMinutes = (mins) => {
  const clamped = Math.max(0, Math.min(24 * 60, mins));
  const h = String(Math.floor(clamped / 60)).padStart(2, "0");
  const m = String(clamped % 60).padStart(2, "0");
  return `${h}:${m}`;
};

// Current date/time in the Europe/Amsterdam timezone, regardless of where
// the serverless function actually runs (Vercel runs in UTC).
const nlNow = () => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Amsterdam",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  let hour = parts.hour === "24" ? "00" : parts.hour;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${parts.minute}`,
  };
};

// Weekday for a "YYYY-MM-DD" string: 0 = Sunday ... 6 = Saturday.
// Built on UTC so it never drifts with the host timezone.
const weekdayOf = (dateStr) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

const addDays = (dateStr, days) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
};

// Human-readable Dutch date, e.g. "woensdag 21 mei 2026".
const formatDateNL = (dateStr) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
};

const rangesOverlap = (start1, end1, start2, end2) =>
  start1 < end2 && start2 < end1;

const MAX_BODY_SIZE = 256 * 1024;

// Read and parse a request body (JSON or urlencoded).
const parseBody = (req) =>
  new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > MAX_BODY_SIZE) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("error", reject);
    req.on("end", () => {
      if (!raw) return resolve({});
      const type = req.headers["content-type"] || "";
      if (type.includes("application/json")) {
        try {
          return resolve(JSON.parse(raw));
        } catch (error) {
          return resolve({});
        }
      }
      if (type.includes("application/x-www-form-urlencoded")) {
        return resolve(Object.fromEntries(new URLSearchParams(raw)));
      }
      try {
        return resolve(JSON.parse(raw));
      } catch (error) {
        return resolve({});
      }
    });
  });

/**
 * Build the list of bookable slots for a date range.
 *
 * @param {object} opts
 * @param {string} opts.from           inclusive start date "YYYY-MM-DD"
 * @param {string} opts.to             inclusive end date "YYYY-MM-DD"
 * @param {Array}  opts.schedules      rows from weekly_schedules
 * @param {Array}  opts.overrides      rows from slot_overrides
 * @param {Array}  opts.bookings       confirmed rows from bookings
 * @returns {Array<{date,time,duration}>}
 */
const generateSlots = ({ from, to, schedules = [], overrides = [], bookings = [] }) => {
  const now = nlNow();
  const slots = [];

  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (date < now.date) continue;
    const weekday = weekdayOf(date);

    // candidate start time -> duration (minutes)
    const candidates = new Map();

    for (const s of schedules) {
      if (s.active === false) continue;
      if (Number(s.weekday) !== weekday) continue;
      const startM = toMinutes(s.start_time);
      const endM = toMinutes(s.end_time);
      const step = Number(s.slot_minutes) || 60;
      if (startM == null || endM == null || step <= 0) continue;
      for (let t = startM; t + step <= endM; t += step) {
        candidates.set(fromMinutes(t), step);
      }
    }

    for (const o of overrides) {
      if (o.date !== date || o.kind !== "open") continue;
      const t = normTime(o.start_time);
      if (t) candidates.set(t, Number(o.slot_minutes) || 60);
    }

    for (const o of overrides) {
      if (o.date !== date || o.kind !== "blocked") continue;
      if (!o.start_time) {
        candidates.clear(); // whole day blocked
        break;
      }
      const t = normTime(o.start_time);
      if (t) candidates.delete(t);
    }

    const dayBookings = bookings.filter(
      (b) => b.slot_date === date && b.status !== "cancelled"
    );

    for (const [time, duration] of candidates) {
      if (date === now.date && time <= now.time) continue;

      const startM = toMinutes(time);
      const endM = startM + duration;
      const clash = dayBookings.some((b) => {
        const bStart = toMinutes(b.slot_time);
        const bEnd = bStart + (Number(b.duration_minutes) || 60);
        return rangesOverlap(startM, endM, bStart, bEnd);
      });
      if (clash) continue;

      slots.push({ date, time, duration });
    }
  }

  slots.sort((a, b) =>
    a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)
  );
  return slots;
};

module.exports = {
  WEEKDAY_NAMES,
  sendJson,
  escapeHtml,
  isValidEmail,
  isValidDate,
  normTime,
  toMinutes,
  fromMinutes,
  nlNow,
  weekdayOf,
  addDays,
  formatDateNL,
  generateSlots,
  parseBody,
};
