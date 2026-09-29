// GET /api/booking/slots?from=YYYY-MM-DD&to=YYYY-MM-DD&duration=30|60
// Public endpoint. Returns the bookable start times for the given date
// range and the requested session length.

const { sb } = require("../_lib/supabase");
const {
  sendJson,
  isValidDate,
  nlNow,
  addDays,
  generateSlots,
  normalizeDuration,
} = require("../_lib/booking");

// How far ahead visitors may book by default.
const DEFAULT_WINDOW_DAYS = 180;
const MAX_WINDOW_DAYS = 200;
// The agenda is always open at least up to this date, even when it lies
// beyond the rolling window (currently: all of Q1 2027).
const OPEN_UNTIL = "2027-03-31";

const later = (a, b) => (a > b ? a : b);

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  }

  try {
    const url = new URL(req.url, "http://localhost");
    const now = nlNow();

    let from = url.searchParams.get("from");
    let to = url.searchParams.get("to");
    if (!isValidDate(from) || from < now.date) from = now.date;
    if (!isValidDate(to)) to = later(addDays(from, DEFAULT_WINDOW_DAYS), OPEN_UNTIL);
    const maxTo = later(addDays(from, MAX_WINDOW_DAYS), OPEN_UNTIL);
    if (to > maxTo) to = maxTo;
    if (to < from) to = from;

    const duration = normalizeDuration(url.searchParams.get("duration"));

    const [schedules, overrides, bookings, recurring] = await Promise.all([
      sb("weekly_schedules?select=*&active=eq.true"),
      sb(`slot_overrides?select=*&date=gte.${from}&date=lte.${to}`),
      sb(
        `bookings?select=slot_date,slot_time,duration_minutes,status&status=eq.confirmed&slot_date=gte.${from}&slot_date=lte.${to}`
      ),
      // Optional table — if it hasn't been created yet, just skip recurring
      // blocks rather than taking down the whole availability.
      sb("recurring_blocks?select=*&active=eq.true").catch(() => []),
    ]);

    const slots = generateSlots({
      from,
      to,
      schedules,
      overrides,
      bookings,
      recurring,
      duration,
    });
    return sendJson(res, 200, { ok: true, from, to, duration, slots });
  } catch (error) {
    return sendJson(res, error.status || 500, {
      ok: false,
      error: "Beschikbaarheid kon niet worden geladen.",
    });
  }
};
