// POST /api/booking/admin
// Password-protected endpoint for managing schedules, overrides and bookings.
// Body: { password, action, payload }

const { sb } = require("../_lib/supabase");
const {
  sendJson,
  parseBody,
  isValidDate,
  normTime,
  addDays,
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
        const [schedules, overrides, bookings, recurring] = await Promise.all([
          sb("weekly_schedules?select=*&order=weekday.asc,start_time.asc"),
          sb("slot_overrides?select=*&order=date.asc,start_time.asc"),
          sb("bookings?select=*&order=slot_date.asc,slot_time.asc"),
          sb("recurring_blocks?select=*&order=weekday.asc,start_time.asc"),
        ]);
        return sendJson(res, 200, {
          ok: true,
          schedules,
          overrides,
          bookings,
          recurring,
        });
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

      case "blockRange": {
        // Block a whole range of days at once (e.g. a holiday week).
        const from = (payload.from || "").trim();
        const to = (payload.to || "").trim();
        if (!isValidDate(from) || !isValidDate(to)) {
          return fail(res, 400, "Kies een geldige begin- en einddatum.");
        }
        if (from > to) {
          return fail(res, 400, "De einddatum moet op of na de begindatum liggen.");
        }
        // Cap the span so a typo can't try to insert thousands of rows.
        const dates = [];
        for (let date = from; date <= to; date = addDays(date, 1)) {
          dates.push(date);
          if (dates.length > 366) {
            return fail(res, 400, "Kies een periode van maximaal één jaar.");
          }
        }
        // Skip days that already have a whole-day block, so re-running the
        // same range stays idempotent and doesn't pile up duplicates.
        const existing = await sb(
          `slot_overrides?select=date&kind=eq.blocked&start_time=is.null` +
            `&date=gte.${from}&date=lte.${to}`
        );
        const blocked = new Set((existing || []).map((row) => row.date));
        const toInsert = dates.filter((date) => !blocked.has(date));
        if (!toInsert.length) {
          return sendJson(res, 200, { ok: true, added: 0 });
        }
        const rows = await sb("slot_overrides", {
          method: "POST",
          prefer: "return=representation",
          body: toInsert.map((date) => ({
            date,
            kind: "blocked",
            start_time: null,
            slot_minutes: 60,
          })),
        });
        return sendJson(res, 200, { ok: true, added: rows.length });
      }

      case "deleteOverride": {
        if (!payload.id) return fail(res, 400, "Ontbrekend id.");
        await sb(`slot_overrides?id=eq.${payload.id}`, { method: "DELETE" });
        return sendJson(res, 200, { ok: true });
      }

      case "addRecurringBlock": {
        // A recurring block closes the same weekday (or weekday + time) every
        // week. One row is stored per chosen weekday so each can be paused or
        // removed on its own.
        const weekdays = Array.isArray(payload.weekdays)
          ? [...new Set(payload.weekdays.map(Number))].filter(
              (w) => w >= 0 && w <= 6
            )
          : [];
        if (!weekdays.length) {
          return fail(res, 400, "Kies minstens één dag.");
        }
        const time = normTime(payload.start_time || "");
        const slot = Number(payload.slot_minutes) || 60;
        const rows = await sb("recurring_blocks", {
          method: "POST",
          prefer: "return=representation",
          body: weekdays.map((weekday) => ({
            weekday,
            // No time = block the whole weekday.
            start_time: time || null,
            slot_minutes: slot,
            active: true,
          })),
        });
        return sendJson(res, 200, { ok: true, added: rows.length });
      }

      case "toggleRecurringBlock": {
        if (!payload.id) return fail(res, 400, "Ontbrekend id.");
        const rows = await sb(`recurring_blocks?id=eq.${payload.id}`, {
          method: "PATCH",
          prefer: "return=representation",
          body: { active: Boolean(payload.active) },
        });
        return sendJson(res, 200, { ok: true, row: rows[0] });
      }

      case "deleteRecurringBlock": {
        if (!payload.id) return fail(res, 400, "Ontbrekend id.");
        await sb(`recurring_blocks?id=eq.${payload.id}`, { method: "DELETE" });
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
