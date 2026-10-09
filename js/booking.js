// Public booking flow for afspraak.html.
// Loads available slots from /api/booking/slots and posts to /api/booking/book.

(() => {
  const app = document.getElementById("bk-app");
  if (!app) return;

  // Price per session length, as listed on tarieven.html.
  const PRICES = { 30: 35, 60: 65, 80: 85 };
  const EXTENDED_DURATION = 80;

  const el = {
    treatments: document.getElementById("bk-treatments"),
    stepDuration: document.getElementById("bk-step-duration"),
    durationLabel: document.getElementById("bk-duration-label"),
    extendWrap: document.getElementById("bk-extend-wrap"),
    extend: document.getElementById("bk-extend"),
    stepDate: document.getElementById("bk-step-date"),
    loading: document.getElementById("bk-loading"),
    empty: document.getElementById("bk-empty"),
    calendar: document.getElementById("bk-calendar"),
    calMonth: document.getElementById("bk-cal-month"),
    calDays: document.getElementById("bk-cal-days"),
    calPrev: document.getElementById("bk-cal-prev"),
    calNext: document.getElementById("bk-cal-next"),
    stepTime: document.getElementById("bk-step-time"),
    times: document.getElementById("bk-times"),
    timeLabel: document.getElementById("bk-time-label"),
    stepForm: document.getElementById("bk-step-form"),
    sumTreatment: document.getElementById("bk-sum-treatment"),
    sumDuration: document.getElementById("bk-sum-duration"),
    sumDate: document.getElementById("bk-sum-date"),
    sumTime: document.getElementById("bk-sum-time"),
    sumPrice: document.getElementById("bk-sum-price"),
    form: document.getElementById("bk-form"),
    feedback: document.getElementById("bk-feedback"),
    back: document.getElementById("bk-back"),
    stepDone: document.getElementById("bk-step-done"),
    doneDetail: document.getElementById("bk-done-detail"),
    ics: document.getElementById("bk-ics"),
  };

  const state = {
    treatment: null, // { slug, name, duration, extendable }
    duration: null,
    byDate: new Map(),
    date: null,
    slot: null,
    viewYear: null,
    viewMonth: null, // 1-12
  };

  // --- formatting helpers -------------------------------------------------
  const parseDate = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  };

  const pad2 = (n) => String(n).padStart(2, "0");
  const isoOf = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;

  const fmtLong = (iso) =>
    new Intl.DateTimeFormat("nl-NL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(parseDate(iso));

  const fmtMonth = (y, m) => {
    const label = new Intl.DateTimeFormat("nl-NL", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(y, m - 1, 1)));
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  const setFeedback = (text, type) => {
    if (!el.feedback) return;
    el.feedback.textContent = text || "";
    el.feedback.classList.toggle("is-visible", Boolean(text));
    el.feedback.classList.toggle("is-error", type === "error");
    el.feedback.classList.toggle("is-success", type === "success");
  };

  // --- calendar -----------------------------------------------------------
  const renderCalendar = () => {
    const { viewYear: y, viewMonth: m } = state;
    el.calMonth.textContent = fmtMonth(y, m);

    const dates = [...state.byDate.keys()].sort();
    const firstYM = dates[0].slice(0, 7);
    const lastYM = dates[dates.length - 1].slice(0, 7);
    const curYM = `${y}-${pad2(m)}`;
    el.calPrev.disabled = curYM <= firstYM;
    el.calNext.disabled = curYM >= lastYM;

    el.calDays.innerHTML = "";

    // Monday-based index (0 = Monday) of the 1st of the month.
    const firstWeekday = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
    for (let i = 0; i < firstWeekday; i += 1) {
      const pad = document.createElement("div");
      pad.className = "bk-cal-pad";
      el.calDays.appendChild(pad);
    }

    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (let d = 1; d <= daysInMonth; d += 1) {
      const iso = isoOf(y, m, d);
      const slots = state.byDate.get(iso);

      if (slots && slots.length) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "bk-cal-day is-available";
        if (iso === state.date) btn.classList.add("is-selected");
        btn.dataset.date = iso;
        btn.setAttribute("role", "listitem");
        btn.setAttribute("aria-label", `${fmtLong(iso)} — ${slots.length} vrije tijden`);
        btn.innerHTML =
          `<span class="bk-cal-num">${d}</span>` +
          `<span class="bk-cal-free">${slots.length} vrij</span>`;
        btn.addEventListener("click", () => selectDate(iso));
        el.calDays.appendChild(btn);
      } else {
        const cell = document.createElement("div");
        cell.className = "bk-cal-day is-disabled";
        cell.innerHTML = `<span class="bk-cal-num">${d}</span>`;
        el.calDays.appendChild(cell);
      }
    }
  };

  const shiftMonth = (delta) => {
    let m = state.viewMonth + delta;
    let y = state.viewYear;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    state.viewMonth = m;
    state.viewYear = y;
    renderCalendar();
  };

  const renderTimes = () => {
    el.times.innerHTML = "";
    (state.byDate.get(state.date) || []).forEach((slot) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bk-time";
      btn.setAttribute("role", "listitem");
      btn.textContent = slot.time;
      btn.addEventListener("click", () => selectTime(slot, btn));
      el.times.appendChild(btn);
    });
  };

  // --- step transitions ---------------------------------------------------
  const showDuration = () => {
    const { treatment, duration } = state;
    el.durationLabel.textContent =
      `${treatment.name} — ${duration} minuten · €${PRICES[duration]}`;
    el.extendWrap.hidden = !treatment.extendable;
  };

  // Changing the session length invalidates the chosen date/time, so the
  // availability is reloaded for the new length.
  const setDuration = (duration) => {
    state.duration = duration;
    state.date = null;
    state.slot = null;
    showDuration();
    el.stepDate.hidden = false;
    el.stepTime.hidden = true;
    el.stepForm.hidden = true;
    el.stepDone.hidden = true;
    el.loading.hidden = false;
    el.calendar.hidden = true;
    el.empty.hidden = true;
    loadSlots();
  };

  const selectTreatment = (btn, { scroll = true } = {}) => {
    state.treatment = {
      slug: btn.dataset.slug,
      name: btn.dataset.name,
      duration: Number(btn.dataset.duration),
      extendable: btn.hasAttribute("data-extendable"),
    };
    [...el.treatments.children].forEach((b) =>
      b.classList.toggle("is-selected", b === btn)
    );
    el.extend.checked = false;
    el.stepDuration.hidden = false;
    setDuration(state.treatment.duration);
    if (scroll) {
      el.stepDuration.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const selectDate = (iso) => {
    state.date = iso;
    state.slot = null;
    renderCalendar();
    el.timeLabel.textContent = fmtLong(iso);
    renderTimes();
    el.stepTime.hidden = false;
    el.stepForm.hidden = true;
    el.stepDone.hidden = true;
    el.stepTime.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const selectTime = (slot, btn) => {
    state.slot = slot;
    [...el.times.children].forEach((b) => b.classList.remove("is-selected"));
    btn.classList.add("is-selected");
    el.sumTreatment.textContent = state.treatment.name;
    el.sumDuration.textContent = `${slot.duration} minuten`;
    el.sumDate.textContent = fmtLong(slot.date);
    el.sumTime.textContent = `${slot.time} uur`;
    el.sumPrice.textContent = `€${PRICES[slot.duration]}`;
    setFeedback("");
    el.stepForm.hidden = false;
    el.stepDone.hidden = true;
    el.stepForm.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Offer the booking's calendar invite (built by the server) as a download.
  const downloadICS = (ics) => {
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "afspraak-menyentuh.ics";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // --- data ---------------------------------------------------------------
  let loadSeq = 0;
  const loadSlots = async () => {
    // Ignore responses for a duration the visitor has since switched away from.
    const seq = (loadSeq += 1);
    try {
      const res = await fetch(`/api/booking/slots?duration=${state.duration}`);
      const data = await res.json().catch(() => ({}));
      if (seq !== loadSeq) return;
      if (!res.ok || data.ok === false) throw new Error("load failed");

      state.byDate = new Map();
      (data.slots || []).forEach((slot) => {
        if (!state.byDate.has(slot.date)) state.byDate.set(slot.date, []);
        state.byDate.get(slot.date).push(slot);
      });

      el.loading.hidden = true;
      if (state.byDate.size === 0) {
        el.calendar.hidden = true;
        el.empty.hidden = false;
        return;
      }
      el.empty.hidden = true;

      // Open the calendar on the month of the first available date.
      const first = [...state.byDate.keys()].sort()[0];
      state.viewYear = Number(first.slice(0, 4));
      state.viewMonth = Number(first.slice(5, 7));
      el.calendar.hidden = false;
      renderCalendar();
    } catch (error) {
      if (seq !== loadSeq) return;
      el.loading.hidden = true;
      el.calendar.hidden = true;
      el.empty.hidden = false;
    }
  };

  // --- events -------------------------------------------------------------
  [...el.treatments.children].forEach((btn) => {
    btn.addEventListener("click", () => selectTreatment(btn));
  });

  el.extend.addEventListener("change", () => {
    setDuration(el.extend.checked ? EXTENDED_DURATION : state.treatment.duration);
  });

  // Treatment preselected via a link such as
  // afspraak.html?behandeling=zwangerschapsmassage (see behandelingen.html).
  const preselect = new URLSearchParams(window.location.search).get("behandeling");
  const preselectBtn = [...el.treatments.children].find(
    (b) => b.dataset.slug === preselect
  );
  if (preselectBtn) selectTreatment(preselectBtn, { scroll: false });

  el.calPrev.addEventListener("click", () => shiftMonth(-1));
  el.calNext.addEventListener("click", () => shiftMonth(1));

  el.back.addEventListener("click", () => {
    el.stepForm.hidden = true;
    el.stepTime.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  el.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setFeedback("");

    if (!state.slot) {
      setFeedback("Kies eerst een datum en tijd.", "error");
      return;
    }

    const fd = new FormData(el.form);
    const naam = (fd.get("naam") || "").trim();
    const email = (fd.get("email") || "").trim();
    const telefoon = (fd.get("telefoon") || "").trim();
    const akkoord = Boolean(fd.get("akkoord"));

    if (!naam) return setFeedback("Vul je naam in.", "error");
    const emailField = document.getElementById("bk-email");
    if (!email || !emailField.validity.valid) {
      return setFeedback("Vul een geldig e-mailadres in.", "error");
    }
    if (!telefoon) return setFeedback("Vul je telefoonnummer in.", "error");
    if (!akkoord) {
      return setFeedback("Ga akkoord met de annuleringsvoorwaarden.", "error");
    }

    const submitBtn = el.form.querySelector("[data-submit-button]");
    const original = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Bezig…";
    setFeedback("Je afspraak wordt vastgelegd…", "success");

    try {
      const res = await fetch("/api/booking/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: state.slot.date,
          time: state.slot.time,
          duration: state.slot.duration,
          behandeling: state.treatment.name,
          naam,
          email,
          telefoon,
          akkoord,
          opmerking: (fd.get("opmerking") || "").trim(),
          _honey: fd.get("_honey") || "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || "Boeken mislukt.");
      }

      const b = data.booking || {};
      el.doneDetail.textContent =
        `${b.dateLabel || fmtLong(state.slot.date)} om ${b.time} uur — ` +
        `${b.treatment} (${b.duration} min)`;
      if (data.ics) {
        el.ics.hidden = false;
        el.ics.onclick = () => downloadICS(data.ics);
      }
      el.stepForm.hidden = true;
      el.stepTime.hidden = true;
      el.stepDate.hidden = true;
      el.stepDuration.hidden = true;
      document.getElementById("bk-step-treatment").hidden = true;
      el.stepDone.hidden = false;
      el.stepDone.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setFeedback(error.message || "Er ging iets mis. Probeer het opnieuw.", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = original;
      // The slot may now be gone — refresh availability in the background.
      if (/beschikbaar|voor/i.test(error.message || "")) {
        el.loading.hidden = false;
        el.calendar.hidden = true;
        el.empty.hidden = true;
        el.stepTime.hidden = true;
        el.stepForm.hidden = true;
        loadSlots();
      }
    }
  });
})();
