// POST /api/booking/book
// Public endpoint. Creates a booking and e-mails both the practice and the
// customer a confirmation (via Resend).

const { sb } = require("../_lib/supabase");
const {
  sendJson,
  parseBody,
  escapeHtml,
  isValidEmail,
  isValidDate,
  normTime,
  nlNow,
  formatDateNL,
  generateSlots,
  normalizeDuration,
  absMinutes,
  LEAD_TIME_MINUTES,
} = require("../_lib/booking");

const PRACTICE_EMAIL = "info@menyentuh.nl";
// Recipients of the new-booking notification.
const BOOKING_NOTIFY_EMAILS = ["info@menyentuh.nl", "Quirina_gal@hotmail.com"];
const FROM_ADDRESS = "Menyentuh <no-reply@menyentuh.nl>";

const sendMail = async ({ to, replyTo, subject, text, html, attachments }) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: Array.isArray(to) ? to : [to],
        reply_to: replyTo,
        subject,
        text,
        html,
        attachments,
      }),
    });
    return res.ok;
  } catch (error) {
    return false;
  }
};

// --- calendar invite (.ics) ---------------------------------------------
const pad2 = (n) => String(n).padStart(2, "0");

// Format a Date as a UTC iCalendar timestamp, e.g. 20260530T133000Z.
const toICSStamp = (d) =>
  `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T` +
  `${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;

// Minutes that Europe/Amsterdam is ahead of UTC at a given instant (handles
// the +1/+2 summer/winter switch automatically).
const amsOffsetMinutes = (instant) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Amsterdam",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value])
  );
  const asUTC = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    +parts.hour === 24 ? 0 : +parts.hour,
    +parts.minute,
    +parts.second
  );
  return (asUTC - instant.getTime()) / 60000;
};

// Convert an Amsterdam wall-clock "YYYY-MM-DD" + "HH:MM" to a UTC Date, so
// the calendar event lands on the correct local moment everywhere.
const amsToUTC = (dateStr, time) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offset = amsOffsetMinutes(new Date(guess));
  return new Date(guess - offset * 60000);
};

const icsEscape = (s) =>
  String(s)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

// Build a minimal RFC 5545 VEVENT the customer can add to their own calendar.
const buildICS = ({ uid, start, durationMin, summary, description, location }) => {
  const end = new Date(start.getTime() + durationMin * 60000);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Menyentuh//Boeking//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toICSStamp(new Date())}`,
    `DTSTART:${toICSStamp(start)}`,
    `DTEND:${toICSStamp(end)}`,
    `SUMMARY:${icsEscape(summary)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    `LOCATION:${icsEscape(location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  }

  let data = {};
  try {
    data = await parseBody(req);
  } catch (error) {
    return sendJson(res, 413, { ok: false, error: "Aanvraag te groot." });
  }

  // Honeypot — silently accept bots without storing anything.
  if (data._honey) return sendJson(res, 200, { ok: true });

  const date = (data.date || "").trim();
  const time = normTime(data.time || "");
  const duration = normalizeDuration(data.duration);
  const name = (data.naam || "").trim();
  const email = (data.email || "").trim();
  const phone = (data.telefoon || "").trim();
  const treatment = (data.behandeling || "").trim();
  const notes = (data.opmerking || "").trim();

  if (!isValidDate(date) || !time) {
    return sendJson(res, 400, { ok: false, error: "Kies een geldig tijdslot." });
  }
  if (!name) {
    return sendJson(res, 400, { ok: false, error: "Vul je naam in." });
  }
  if (!isValidEmail(email)) {
    return sendJson(res, 400, { ok: false, error: "Vul een geldig e-mailadres in." });
  }
  if (!treatment) {
    return sendJson(res, 400, { ok: false, error: "Kies een behandeling." });
  }
  if (!phone) {
    return sendJson(res, 400, { ok: false, error: "Vul je telefoonnummer in." });
  }
  if (!data.akkoord) {
    return sendJson(res, 400, {
      ok: false,
      error: "Ga akkoord met de annuleringsvoorwaarden.",
    });
  }

  try {
    const now = nlNow();
    const cutoff = absMinutes(now.date, now.time) + LEAD_TIME_MINUTES;
    if (absMinutes(date, time) < cutoff) {
      return sendJson(res, 409, {
        ok: false,
        error:
          "Een afspraak moet minstens 12 uur van tevoren geboekt worden. Kies een later moment.",
      });
    }

    // Re-check availability against the live schedule to avoid booking a
    // slot that no longer exists or was taken in the meantime.
    const [schedules, overrides, bookings] = await Promise.all([
      sb("weekly_schedules?select=*&active=eq.true"),
      sb(`slot_overrides?select=*&date=eq.${date}`),
      sb(
        `bookings?select=slot_date,slot_time,duration_minutes,status&status=eq.confirmed&slot_date=eq.${date}`
      ),
    ]);

    const slot = generateSlots({
      from: date,
      to: date,
      schedules,
      overrides,
      bookings,
      duration,
    }).find((s) => s.time === time);

    if (!slot) {
      return sendJson(res, 409, {
        ok: false,
        error: "Dit tijdslot is niet (meer) beschikbaar. Kies een ander moment.",
      });
    }

    let booking;
    try {
      const inserted = await sb("bookings", {
        method: "POST",
        prefer: "return=representation",
        body: {
          slot_date: date,
          slot_time: time,
          duration_minutes: slot.duration,
          treatment,
          name,
          email,
          phone: phone || null,
          notes: notes || null,
          status: "confirmed",
        },
      });
      booking = Array.isArray(inserted) ? inserted[0] : inserted;
    } catch (error) {
      // 23505 = unique violation: the slot was booked a moment ago.
      const code = error.detail && error.detail.code;
      if (error.status === 409 || code === "23505") {
        return sendJson(res, 409, {
          ok: false,
          error: "Iemand was je net voor. Kies een ander tijdslot.",
        });
      }
      throw error;
    }

    // Notify the practice and the customer. Failure here must not lose
    // the booking — it is already stored.
    const prettyDate = formatDateNL(date);

    // Calendar invite for the customer, so the appointment lands in their
    // own agenda and they're far less likely to forget it.
    const ics = buildICS({
      uid: `${booking.id || `${date}-${time}`}@menyentuh.nl`,
      start: amsToUTC(date, time),
      durationMin: slot.duration,
      summary: `Massage bij Menyentuh — ${treatment}`,
      description:
        `${treatment} (${slot.duration} minuten) bij Menyentuh.\n` +
        "Annuleren of verzetten kan kosteloos tot 24 uur van tevoren — " +
        "stuur even een berichtje.",
      location: "Menyentuh, Lelystad",
    });
    const icsAttachment = {
      filename: "afspraak-menyentuh.ics",
      content: Buffer.from(ics, "utf8").toString("base64"),
    };

    const lines = [
      `Datum: ${prettyDate}`,
      `Tijd: ${time} (${slot.duration} min)`,
      `Behandeling: ${treatment}`,
      `Naam: ${name}`,
      `E-mail: ${email}`,
      `Telefoon: ${phone || "-"}`,
      `Opmerking: ${notes || "-"}`,
    ];

    await Promise.all([
      sendMail({
        to: BOOKING_NOTIFY_EMAILS,
        replyTo: email,
        subject: `Nieuwe boeking — ${prettyDate} ${time}`,
        text: lines.join("\n"),
        html: lines.map((l) => `<p>${escapeHtml(l)}</p>`).join(""),
      }),
      sendMail({
        to: email,
        replyTo: PRACTICE_EMAIL,
        subject: "Bevestiging van je afspraak bij Menyentuh",
        text: [
          `Hoi ${name},`,
          "",
          "Je afspraak bij Menyentuh is bevestigd:",
          "",
          `  ${prettyDate}`,
          `  ${time} uur (${slot.duration} minuten)`,
          `  ${treatment}`,
          "",
          "Locatie: praktijk in Lelystad.",
          "Annuleren kan kosteloos tot 24 uur vooraf — stuur even een berichtje.",
          "",
          "In de bijlage zit een agendabestand (.ics) om de afspraak in je eigen agenda te zetten.",
          "",
          "Tot snel!",
          "Quirina — Menyentuh",
        ].join("\n"),
        html: [
          `<p>Hoi ${escapeHtml(name)},</p>`,
          `<p>Je afspraak bij <strong>Menyentuh</strong> is bevestigd:</p>`,
          `<p><strong>${escapeHtml(prettyDate)}</strong><br/>` +
            `${escapeHtml(time)} uur (${slot.duration} minuten)<br/>` +
            `${escapeHtml(treatment)}</p>`,
          `<p>Locatie: praktijk in Lelystad.<br/>` +
            `Annuleren kan kosteloos tot 24 uur vooraf — stuur even een berichtje.</p>`,
          `<p>In de bijlage zit een agendabestand (.ics) waarmee je de afspraak ` +
            `met één tik in je eigen agenda zet.</p>`,
          `<p>Tot snel!<br/>Quirina — Menyentuh</p>`,
        ].join(""),
        attachments: [icsAttachment],
      }),
    ]);

    return sendJson(res, 200, {
      ok: true,
      booking: {
        date,
        time,
        duration: slot.duration,
        treatment,
        dateLabel: prettyDate,
      },
    });
  } catch (error) {
    return sendJson(res, error.status || 500, {
      ok: false,
      error: "Er ging iets mis bij het boeken. Probeer het opnieuw.",
    });
  }
};
