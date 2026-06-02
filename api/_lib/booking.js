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

// Visitors choose the session length themselves; start times sit on a grid
// of GRID_MINUTES so a 30- and a 60-minute booking line up cleanly.
const BOOKABLE_DURATIONS = [30, 60, 80];
const GRID_MINUTES = 30;

// Turnaround time kept free before and after every booking, so the
// practice can wrap up one client and prepare for the next.
const BUFFER_MINUTES = 20;

// Minimum notice: a slot must be at least this far in the future to be
// bookable, so visitors cannot book last-minute without the practice
// getting a chance to see it.
const LEAD_TIME_MINUTES = 12 * 60;

// Absolute minute count for a calendar date + time — used to compare
// moments across day boundaries.
const absMinutes = (dateStr, time) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const day = Date.UTC(y, m - 1, d) / 86400000;
  return day * 1440 + (toMinutes(time) || 0);
};

const normalizeDuration = (value) => {
  const n = Number(value);
  return BOOKABLE_DURATIONS.includes(n) ? n : 60;
};

/**
 * Build the list of bookable start times for a date range and a chosen
 * session length. A weekly schedule (and an "open" override) defines an
 * availability *window*; within it every grid-aligned start where the
 * requested duration fits and nothing is occupied is bookable.
 *
 * @param {object} opts
 * @param {string} opts.from        inclusive start date "YYYY-MM-DD"
 * @param {string} opts.to          inclusive end date "YYYY-MM-DD"
 * @param {Array}  opts.schedules   rows from weekly_schedules
 * @param {Array}  opts.overrides   rows from slot_overrides
 * @param {Array}  opts.bookings    confirmed rows from bookings
 * @param {number} opts.duration    requested session length (30 or 60)
 * @returns {Array<{date,time,duration}>}
 */
const generateSlots = ({
  from,
  to,
  schedules = [],
  overrides = [],
  bookings = [],
  recurring = [],
  duration = 60,
}) => {
  const now = nlNow();
  const dur = normalizeDuration(duration);
  const cutoff = absMinutes(now.date, now.time) + LEAD_TIME_MINUTES;
  const slots = [];

  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (date < now.date) continue;
    const weekday = weekdayOf(date);

    // The whole day is closed when a one-off block, or a recurring weekday
    // block, covers it without a start time. An explicitly added extra slot
    // ("open" override) on that date always wins, so a normally-closed day
    // (e.g. every Saturday) can still be opened by hand for one date.
    const hasOpenOverride = overrides.some(
      (o) => o.date === date && o.kind === "open"
    );
    const overrideWholeDay = overrides.some(
      (o) => o.date === date && o.kind === "blocked" && !o.start_time
    );
    const recurringWholeDay = recurring.some(
      (r) =>
        r.active !== false && Number(r.weekday) === weekday && !r.start_time
    );
    if (overrideWholeDay || (recurringWholeDay && !hasOpenOverride)) continue;

    // When a recurring block normally closes the whole day but an extra slot
    // reopens it, only that extra slot counts — the regular weekly schedule
    // stays suppressed for this date.
    const onlyOpenWindows = recurringWholeDay;

    // Availability windows: [startMinutes, endMinutes].
    const windows = [];
    if (!onlyOpenWindows) {
      for (const s of schedules) {
        if (s.active === false) continue;
        if (Number(s.weekday) !== weekday) continue;
        const a = toMinutes(s.start_time);
        const b = toMinutes(s.end_time);
        if (a != null && b != null && a < b) windows.push([a, b]);
      }
    }
    for (const o of overrides) {
      if (o.date !== date || o.kind !== "open") continue;
      const a = toMinutes(o.start_time);
      if (a != null) windows.push([a, a + (Number(o.slot_minutes) || 60)]);
    }
    if (!windows.length) continue;

    // Occupied ranges: confirmed bookings + time-specific blocks.
    // Bookings are padded with BUFFER_MINUTES on both sides so a new
    // booking can never start within the turnaround time of another.
    const occupied = [];
    for (const b of bookings) {
      if (b.slot_date !== date || b.status === "cancelled") continue;
      const a = toMinutes(b.slot_time);
      if (a == null) continue;
      const end = a + (Number(b.duration_minutes) || 60);
      occupied.push([a - BUFFER_MINUTES, end + BUFFER_MINUTES]);
    }
    for (const o of overrides) {
      if (o.date !== date || o.kind !== "blocked" || !o.start_time) continue;
      const a = toMinutes(o.start_time);
      if (a != null) occupied.push([a, a + (Number(o.slot_minutes) || GRID_MINUTES)]);
    }
    // Recurring weekday blocks with a start time close that slot every week.
    for (const r of recurring) {
      if (r.active === false) continue;
      if (Number(r.weekday) !== weekday || !r.start_time) continue;
      const a = toMinutes(r.start_time);
      if (a != null) occupied.push([a, a + (Number(r.slot_minutes) || GRID_MINUTES)]);
    }

    const seen = new Set();
    for (const [winStart, winEnd] of windows) {
      for (let t = winStart; t + dur <= winEnd; t += GRID_MINUTES) {
        const time = fromMinutes(t);
        if (seen.has(time)) continue;
        if (absMinutes(date, time) < cutoff) continue; // too soon / in the past
        if (occupied.some(([s, e]) => rangesOverlap(t, t + dur, s, e))) continue;
        seen.add(time);
        slots.push({ date, time, duration: dur });
      }
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
  BOOKABLE_DURATIONS,
  normalizeDuration,
  LEAD_TIME_MINUTES,
  absMinutes,
};
