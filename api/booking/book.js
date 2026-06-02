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

// Branded HTML confirmation for the customer. Built table-first with inline
// styles and solid colours so it renders consistently across Gmail, Apple
// Mail and Outlook; the brand fonts are progressively enhanced via @import
// and fall back to Georgia/Arial where web fonts aren't loaded.
const customerConfirmationHtml = ({
  name,
  prettyDate,
  time,
  duration,
  treatment,
}) => {
  const SERIF = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
  const SANS = "'Manrope', Arial, 'Segoe UI', Helvetica, sans-serif";
  const row = (label, value) =>
    `<tr>` +
    `<td style="padding:4px 0;font-family:${SANS};font-size:14px;color:#4f6660;width:96px;vertical-align:top;">${label}</td>` +
    `<td style="padding:4px 0;font-family:${SANS};font-size:15px;color:#1f332c;font-weight:600;">${value}</td>` +
    `</tr>`;

  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
<title>Bevestiging van je afspraak</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@400;500;600;700&display=swap');
  body { margin:0 !important; padding:0 !important; width:100% !important; }
  a { text-decoration:none; }
  @media only screen and (max-width:600px) {
    .mny-card { width:100% !important; border-radius:0 !important; }
    .mny-px { padding-left:24px !important; padding-right:24px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#e7f1ec;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#e7f1ec;font-size:1px;line-height:1px;">Bedankt voor je reservering — je afspraak bij Menyentuh is bevestigd.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#e7f1ec;">
    <tr>
      <td align="center" style="padding:30px 12px;">
        <table role="presentation" class="mny-card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#fefcf7;border-radius:20px;overflow:hidden;box-shadow:0 14px 34px rgba(23,55,44,0.12);">
          <tr>
            <td style="background:#17372c;padding:36px 40px 30px;text-align:center;">
              <div style="font-family:${SANS};font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#ddb36c;">Massagepraktijk &middot; Lelystad</div>
              <div style="font-family:${SERIF};font-size:40px;font-weight:600;color:#fefcf7;line-height:1.05;margin-top:6px;">Menyentuh</div>
            </td>
          </tr>
          <tr><td style="height:3px;background:#c99642;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr>
            <td class="mny-px" style="padding:36px 40px 6px;">
              <p style="margin:0 0 14px;font-family:${SANS};font-size:16px;color:#1f332c;">Hoi ${name},</p>
              <p style="margin:0 0 24px;font-family:${SANS};font-size:16px;line-height:1.6;color:#4f6660;">Bedankt voor je reservering. Je afspraak bij Menyentuh is bevestigd — ik kijk ernaar uit je te ontvangen.</p>
            </td>
          </tr>
          <tr>
            <td class="mny-px" style="padding:0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f8f5;border-radius:12px;">
                <tr>
                  <td style="padding:24px 26px;border-left:3px solid #c99642;border-radius:12px;">
                    <div style="font-family:${SERIF};font-size:25px;font-weight:600;color:#17372c;margin-bottom:14px;line-height:1.2;">${treatment}</div>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      ${row("Datum", prettyDate)}
                      ${row("Tijd", `${time} uur (${duration} minuten)`)}
                      ${row("Locatie", "Praktijk in Lelystad")}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="mny-px" style="padding:28px 40px 0;font-family:${SANS};font-size:14.5px;line-height:1.65;color:#4f6660;">
              <p style="margin:0 0 14px;">Een dag voor je afspraak ontvang je nog een <strong style="color:#1f332c;">herinnering</strong> met alle nodige informatie. Houd ook dan je <strong style="color:#1f332c;">spam- of ongewenste-mailmap</strong> in de gaten.</p>
              <p style="margin:0 0 14px;">Staat deze e-mail bij spam of ongewenst? Markeer hem dan als <strong style="color:#1f332c;">&lsquo;geen spam&rsquo;</strong> en voeg de afzender (<strong style="color:#1f332c;">no-reply@menyentuh.nl</strong>) toe aan je contacten. Berichten van een afzender in je contacten belanden niet in spam, dus zo ontvang je ook de herinnering betrouwbaar in je inbox.</p>
              <p style="margin:0 0 14px;">In de bijlage zit een <strong style="color:#1f332c;">agendabestand (.ics)</strong> waarmee je de afspraak met &eacute;&eacute;n tik in je eigen agenda zet.</p>
              <p style="margin:0;">Annuleren of verzetten kan kosteloos tot 24 uur van tevoren — stuur even een berichtje.</p>
            </td>
          </tr>
          <tr>
            <td class="mny-px" style="padding:24px 40px 38px;font-family:${SANS};font-size:15px;color:#1f332c;">
              <p style="margin:0;">Tot snel!</p>
              <p style="margin:6px 0 0;font-family:${SERIF};font-size:22px;color:#17372c;">Quirina &middot; Menyentuh</p>
            </td>
          </tr>
          <tr>
            <td style="background:#17372c;padding:24px 40px;text-align:center;">
              <div style="font-family:${SANS};font-size:13px;color:#cfe2d8;line-height:1.8;">
                <a href="mailto:info@menyentuh.nl" style="color:#eacb8c;text-decoration:none;">info@menyentuh.nl</a>
                &nbsp;&middot;&nbsp;
                <a href="https://wa.me/31657768109" style="color:#eacb8c;text-decoration:none;">WhatsApp</a>
                &nbsp;&middot;&nbsp;
                <a href="https://www.instagram.com/menyentuh_qm" style="color:#eacb8c;text-decoration:none;">@menyentuh_qm</a>
              </div>
              <div style="font-family:${SANS};font-size:11px;color:#98b8a7;margin-top:10px;letter-spacing:0.5px;">Menyentuh &middot; Massagepraktijk &middot; Lelystad</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
    const [schedules, overrides, bookings, recurring] = await Promise.all([
      sb("weekly_schedules?select=*&active=eq.true"),
      sb(`slot_overrides?select=*&date=eq.${date}`),
      sb(
        `bookings?select=slot_date,slot_time,duration_minutes,status&status=eq.confirmed&slot_date=eq.${date}`
      ),
      // Optional table — tolerate it not existing yet (see slots.js).
      sb("recurring_blocks?select=*&active=eq.true").catch(() => []),
    ]);

    const slot = generateSlots({
      from: date,
      to: date,
      schedules,
      overrides,
      bookings,
      recurring,
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
          "Bedankt voor je reservering! Je afspraak bij Menyentuh is bevestigd:",
          "",
          `  ${prettyDate}`,
          `  ${time} uur (${slot.duration} minuten)`,
          `  ${treatment}`,
          "",
          "Locatie: praktijk in Lelystad.",
          "Annuleren kan kosteloos tot 24 uur vooraf — stuur even een berichtje.",
          "",
          "Een dag voor je afspraak ontvang je nog een herinnering met alle nodige informatie. Houd ook dan je spam- of ongewenste-mailmap in de gaten.",
          "",
          "Staat deze e-mail bij spam of ongewenst? Markeer hem dan als 'geen spam' en voeg de afzender (no-reply@menyentuh.nl) toe aan je contacten. Berichten van een afzender in je contacten belanden niet in spam, dus zo ontvang je ook de herinnering betrouwbaar in je inbox.",
          "",
          "In de bijlage zit een agendabestand (.ics) om de afspraak in je eigen agenda te zetten.",
          "",
          "Tot snel!",
          "Quirina — Menyentuh",
        ].join("\n"),
        html: customerConfirmationHtml({
          name: escapeHtml(name),
          prettyDate: escapeHtml(prettyDate),
          time: escapeHtml(time),
          duration: slot.duration,
          treatment: escapeHtml(treatment),
        }),
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
