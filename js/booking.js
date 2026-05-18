// Public booking flow for afspraak.html.
// Loads available slots from /api/booking/slots and posts to /api/booking/book.

(() => {
  const app = document.getElementById("bk-app");
  if (!app) return;

  const el = {
    durations: document.getElementById("bk-durations"),
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
    chosen: document.getElementById("bk-chosen"),
    form: document.getElementById("bk-form"),
    feedback: document.getElementById("bk-feedback"),
    back: document.getElementById("bk-back"),
    stepDone: document.getElementById("bk-step-done"),
    doneDetail: document.getElementById("bk-done-detail"),
  };

  const state = {
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
  const selectDuration = (duration, btn) => {
    state.duration = duration;
    state.date = null;
    state.slot = null;
    [...el.durations.children].forEach((b) =>
      b.classList.toggle("is-selected", b === btn)
    );
    el.stepDate.hidden = false;
    el.stepTime.hidden = true;
    el.stepForm.hidden = true;
    el.stepDone.hidden = true;
    el.loading.hidden = false;
    el.calendar.hidden = true;
    el.empty.hidden = true;
    loadSlots();
    el.stepDate.scrollIntoView({ behavior: "smooth", block: "start" });
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
    el.chosen.textContent =
      `${fmtLong(slot.date)} om ${slot.time} uur — ${slot.duration} minuten`;
    setFeedback("");
    el.stepForm.hidden = false;
    el.stepDone.hidden = true;
    el.stepForm.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // --- data ---------------------------------------------------------------
  const loadSlots = async () => {
    try {
      const res = await fetch(`/api/booking/slots?duration=${state.duration}`);
      const data = await res.json().catch(() => ({}));
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
      el.loading.hidden = true;
      el.calendar.hidden = true;
      el.empty.hidden = false;
    }
  };

  // --- events -------------------------------------------------------------
  [...el.durations.children].forEach((btn) => {
    btn.addEventListener("click", () =>
      selectDuration(Number(btn.dataset.duration), btn)
    );
  });

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
    const behandeling = (fd.get("behandeling") || "").trim();
    const naam = (fd.get("naam") || "").trim();
    const email = (fd.get("email") || "").trim();

    if (!behandeling) return setFeedback("Kies een behandeling.", "error");
    if (!naam) return setFeedback("Vul je naam in.", "error");
    const emailField = document.getElementById("bk-email");
    if (!email || !emailField.validity.valid) {
      return setFeedback("Vul een geldig e-mailadres in.", "error");
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
          behandeling,
          naam,
          email,
          telefoon: (fd.get("telefoon") || "").trim(),
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
      el.stepForm.hidden = true;
      el.stepTime.hidden = true;
      el.stepDate.hidden = true;
      document.getElementById("bk-step-duration").hidden = true;
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
