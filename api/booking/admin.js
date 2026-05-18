// POST /api/booking/admin
// Password-protected endpoint for managing schedules, overrides and bookings.
// Body: { password, action, payload }

const { sb } = require("../_lib/supabase");
const {
  sendJson,
  parseBody,
  isValidDate,
  normTime,
} = require("../_lib/booking");

// Constant-time-ish string compare so the password check does not leak
// length/contents through timing.
const safeEqual = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};

const fail = (res, status, error) => sendJson(res, status, { ok: false, error });

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return fail(res, 405, "Method not allowed");
  }

  const expected = process.env.BOOKING_ADMIN_PASSWORD;
  if (!expected) {
    return fail(res, 500, "Beheerwachtwoord is niet ingesteld op de server.");
  }

  let data = {};
  try {
    data = await parseBody(req);
  } catch (error) {
    return fail(res, 413, "Aanvraag te groot.");
  }

  if (!safeEqual(String(data.password || ""), expected)) {
    return fail(res, 401, "Onjuist wachtwoord.");
  }

  const action = data.action;
  const payload = data.payload || {};

  try {
    switch (action) {
      case "login":
        return sendJson(res, 200, { ok: true });

      case "list": {
        const [schedules, overrides, bookings] = await Promise.all([
          sb("weekly_schedules?select=*&order=weekday.asc,start_time.asc"),
          sb("slot_overrides?select=*&order=date.asc,start_time.asc"),
          sb("bookings?select=*&order=slot_date.asc,slot_time.asc"),
        ]);
        return sendJson(res, 200, { ok: true, schedules, overrides, bookings });
      }

      case "addSchedule": {
        // A weekly schedule is an availability *window*; the visitor picks
        // the session length (30/60 min) themselves when booking.
        const weekday = Number(payload.weekday);
        const start = normTime(payload.start_time);
        const end = normTime(payload.end_time);
        if (!(weekday >= 0 && weekday <= 6)) {
          return fail(res, 400, "Kies een geldige weekdag.");
        }
        if (!start || !end || start >= end) {
          return fail(res, 400, "Eindtijd moet na de starttijd liggen.");
        }
        const rows = await sb("weekly_schedules", {
          method: "POST",
          prefer: "return=representation",
          body: {
            weekday,
            start_time: start,
            end_time: end,
            slot_minutes: 60, // kolom niet-null; niet meer gebruikt
            active: true,
          },
        });
        return sendJson(res, 200, { ok: true, row: rows[0] });
      }

      case "toggleSchedule": {
        if (!payload.id) return fail(res, 400, "Ontbrekend id.");
        const rows = await sb(`weekly_schedules?id=eq.${payload.id}`, {
          method: "PATCH",
          prefer: "return=representation",
          body: { active: Boolean(payload.active) },
        });
        return sendJson(res, 200, { ok: true, row: rows[0] });
      }

      case "deleteSchedule": {
        if (!payload.id) return fail(res, 400, "Ontbrekend id.");
        await sb(`weekly_schedules?id=eq.${payload.id}`, { method: "DELETE" });
        return sendJson(res, 200, { ok: true });
      }

      case "addOverride": {
        const date = (payload.date || "").trim();
        const kind = payload.kind === "blocked" ? "blocked" : "open";
        const time = normTime(payload.start_time || "");
        const slot = Number(payload.slot_minutes) || 60;
        if (!isValidDate(date)) {
          return fail(res, 400, "Kies een geldige datum.");
        }
        if (kind === "open" && !time) {
          return fail(res, 400, "Een extra slot heeft een starttijd nodig.");
        }
        const rows = await sb("slot_overrides", {
          method: "POST",
          prefer: "return=representation",
          body: {
            date,
            kind,
            // A blocked entry without a time blocks the whole day.
            start_time: time || null,
            slot_minutes: slot,
          },
        });
        return sendJson(res, 200, { ok: true, row: rows[0] });
      }

      case "deleteOverride": {
        if (!payload.id) return fail(res, 400, "Ontbrekend id.");
        await sb(`slot_overrides?id=eq.${payload.id}`, { method: "DELETE" });
        return sendJson(res, 200, { ok: true });
      }

      case "cancelBooking": {
        if (!payload.id) return fail(res, 400, "Ontbrekend id.");
        await sb(`bookings?id=eq.${payload.id}`, {
          method: "PATCH",
          body: { status: "cancelled" },
        });
        return sendJson(res, 200, { ok: true });
      }

      case "deleteBooking": {
        if (!payload.id) return fail(res, 400, "Ontbrekend id.");
        await sb(`bookings?id=eq.${payload.id}`, { method: "DELETE" });
        return sendJson(res, 200, { ok: true });
      }

      default:
        return fail(res, 400, "Onbekende actie.");
    }
  } catch (error) {
    return fail(res, error.status || 500, "Er ging iets mis bij het opslaan.");
  }
};
