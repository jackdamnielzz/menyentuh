// Public booking flow for afspraak.html.
// Loads available slots from /api/booking/slots and posts to /api/booking/book.

(() => {
  const app = document.getElementById("bk-app");
  if (!app) return;

  const el = {
    loading: document.getElementById("bk-loading"),
    empty: document.getElementById("bk-empty"),
    dates: document.getElementById("bk-dates"),
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

  const state = { byDate: new Map(), date: null, slot: null };

  // --- formatting helpers -------------------------------------------------
  const parseDate = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  };

  const fmtWeekday = (iso) =>
    new Intl.DateTimeFormat("nl-NL", { weekday: "short", timeZone: "UTC" }).format(
      parseDate(iso)
    );

  const fmtDayMonth = (iso) =>
    new Intl.DateTimeFormat("nl-NL", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(parseDate(iso));

  const fmtLong = (iso) =>
    new Intl.DateTimeFormat("nl-NL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(parseDate(iso));

  const setFeedback = (text, type) => {
    if (!el.feedback) return;
    el.feedback.textContent = text || "";
    el.feedback.classList.toggle("is-visible", Boolean(text));
    el.feedback.classList.toggle("is-error", type === "error");
    el.feedback.classList.toggle("is-success", type === "success");
  };

  // --- rendering ----------------------------------------------------------
  const renderDates = () => {
    el.dates.innerHTML = "";
    const dates = [...state.byDate.keys()].sort();
    dates.forEach((iso) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bk-date";
      btn.setAttribute("role", "listitem");
      btn.dataset.date = iso;
      btn.innerHTML =
        `<span class="bk-date-wd">${fmtWeekday(iso)}</span>` +
        `<span class="bk-date-dm">${fmtDayMonth(iso)}</span>` +
        `<span class="bk-date-count">${state.byDate.get(iso).length} vrij</span>`;
      btn.addEventListener("click", () => selectDate(iso));
      el.dates.appendChild(btn);
    });
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
  const selectDate = (iso) => {
    state.date = iso;
    state.slot = null;
    [...el.dates.children].forEach((b) =>
      b.classList.toggle("is-selected", b.dataset.date === iso)
    );
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
    el.chosen.textContent = `${fmtLong(slot.date)} om ${slot.time} uur (${slot.duration} min)`;
    setFeedback("");
    el.stepForm.hidden = false;
    el.stepDone.hidden = true;
    el.stepForm.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // --- data ---------------------------------------------------------------
  const loadSlots = async () => {
    try {
      const res = await fetch("/api/booking/slots");
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error("load failed");

      state.byDate = new Map();
      (data.slots || []).forEach((slot) => {
        if (!state.byDate.has(slot.date)) state.byDate.set(slot.date, []);
        state.byDate.get(slot.date).push(slot);
      });

      el.loading.hidden = true;
      if (state.byDate.size === 0) {
        el.empty.hidden = false;
        return;
      }
      renderDates();
    } catch (error) {
      el.loading.hidden = true;
      el.empty.hidden = false;
    }
  };

  // --- submit -------------------------------------------------------------
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
        `${b.dateLabel || fmtLong(state.slot.date)} om ${b.time} uur — ${b.treatment}`;
      el.stepForm.hidden = true;
      el.stepTime.hidden = true;
      document.getElementById("bk-step-date").hidden = true;
      el.stepDone.hidden = false;
      el.stepDone.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setFeedback(error.message || "Er ging iets mis. Probeer het opnieuw.", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = original;
      // The slot may now be gone — refresh availability in the background.
      if (/beschikbaar|voor/i.test(error.message || "")) {
        state.byDate = new Map();
        el.loading.hidden = false;
        el.empty.hidden = true;
        document.getElementById("bk-step-date").hidden = false;
        el.stepTime.hidden = true;
        el.stepForm.hidden = true;
        loadSlots();
      }
    }
  });

  loadSlots();
})();
