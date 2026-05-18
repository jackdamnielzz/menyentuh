// GET /api/booking/slots?from=YYYY-MM-DD&to=YYYY-MM-DD
// Public endpoint. Returns the bookable slots for the given date range.

const { sb } = require("../_lib/supabase");
const {
  sendJson,
  isValidDate,
  nlNow,
  addDays,
  generateSlots,
} = require("../_lib/booking");

// How far ahead visitors may book by default.
const DEFAULT_WINDOW_DAYS = 56;
const MAX_WINDOW_DAYS = 120;

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
    if (!isValidDate(to)) to = addDays(from, DEFAULT_WINDOW_DAYS);
    if (to > addDays(from, MAX_WINDOW_DAYS)) to = addDays(from, MAX_WINDOW_DAYS);
    if (to < from) to = from;

    const [schedules, overrides, bookings] = await Promise.all([
      sb("weekly_schedules?select=*&active=eq.true"),
      sb(`slot_overrides?select=*&date=gte.${from}&date=lte.${to}`),
      sb(
        `bookings?select=slot_date,slot_time,duration_minutes,status&status=eq.confirmed&slot_date=gte.${from}&slot_date=lte.${to}`
      ),
    ]);

    const slots = generateSlots({ from, to, schedules, overrides, bookings });
    return sendJson(res, 200, { ok: true, from, to, slots });
  } catch (error) {
    return sendJson(res, error.status || 500, {
      ok: false,
      error: "Beschikbaarheid kon niet worden geladen.",
    });
  }
};
