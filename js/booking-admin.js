// Admin dashboard for beheer-afspraken.html.
// Talks to the password-protected /api/booking/admin endpoint.

(() => {
  const loginPanel = document.getElementById("adm-login");
  if (!loginPanel) return;

  const els = {
    login: loginPanel,
    loginForm: document.getElementById("adm-login-form"),
    loginFeedback: document.getElementById("adm-login-feedback"),
    dash: document.getElementById("adm-dash"),
    feedback: document.getElementById("adm-feedback"),
    logout: document.getElementById("adm-logout"),
    schedules: document.getElementById("adm-schedules"),
    overrides: document.getElementById("adm-overrides"),
    bookings: document.getElementById("adm-bookings"),
    scheduleForm: document.getElementById("adm-schedule-form"),
    overrideForm: document.getElementById("adm-override-form"),
    overrideKind: document.getElementById("adm-override-kind"),
    blockRangeForm: document.getElementById("adm-block-range-form"),
  };

  const WEEKDAYS = [
    "Zondag",
    "Maandag",
    "Dinsdag",
    "Woensdag",
    "Donderdag",
    "Vrijdag",
    "Zaterdag",
  ];

  const STORE_KEY = "menyentuh-admin-pw";
  let password = sessionStorage.getItem(STORE_KEY) || "";

  // --- helpers ------------------------------------------------------------
  const fmtTime = (t) => (t ? String(t).slice(0, 5) : "");

  const fmtDate = (iso) => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-").map(Number);
    return new Intl.DateTimeFormat("nl-NL", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(y, m - 1, d)));
  };

  const setFeedback = (node, text, type) => {
    if (!node) return;
    node.textContent = text || "";
    node.classList.toggle("is-visible", Boolean(text));
    node.classList.toggle("is-error", type === "error");
    node.classList.toggle("is-success", type === "success");
  };

  // POST an action to the admin API.
  const api = async (action, payload) => {
    const res = await fetch("/api/booking/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, action, payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      sessionStorage.removeItem(STORE_KEY);
      password = "";
      showLogin("Sessie verlopen. Log opnieuw in.");
      throw new Error("auth");
    }
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || "Er ging iets mis.");
    }
    return data;
  };

  // --- rendering ----------------------------------------------------------
  const renderSchedules = (rows) => {
    els.schedules.innerHTML = "";
    if (!rows.length) {
      els.schedules.innerHTML = '<p class="adm-empty">Nog geen weekschema\'s.</p>';
      return;
    }
    rows.forEach((row) => {
      const item = document.createElement("div");
      item.className = "adm-item" + (row.active ? "" : " is-inactive");
      item.innerHTML =
        `<span class="adm-item-main">${WEEKDAYS[row.weekday]} · ` +
        `${fmtTime(row.start_time)}–${fmtTime(row.end_time)}</span>` +
        `<span class="adm-item-actions"></span>`;
      const actions = item.querySelector(".adm-item-actions");

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "adm-mini-btn";
      toggle.textContent = row.active ? "Pauzeer" : "Activeer";
      toggle.addEventListener("click", () =>
        run(() => api("toggleSchedule", { id: row.id, active: !row.active }))
      );

      const del = document.createElement("button");
      del.type = "button";
      del.className = "adm-mini-btn is-danger";
      del.textContent = "Verwijder";
      del.addEventListener("click", () => {
        if (!confirm("Dit weekschema verwijderen?")) return;
        run(() => api("deleteSchedule", { id: row.id }));
      });

      actions.append(toggle, del);
      els.schedules.appendChild(item);
    });
  };

  const renderOverrides = (rows) => {
    els.overrides.innerHTML = "";
    if (!rows.length) {
      els.overrides.innerHTML = '<p class="adm-empty">Geen losse aanpassingen.</p>';
      return;
    }
    rows.forEach((row) => {
      const item = document.createElement("div");
      item.className = "adm-item";
      const label =
        row.kind === "blocked"
          ? `Geblokkeerd · ${fmtDate(row.date)}` +
            (row.start_time
              ? ` · ${fmtTime(row.start_time)} (${row.slot_minutes} min)`
              : " · hele dag")
          : `Extra venster · ${fmtDate(row.date)} · ${fmtTime(row.start_time)} · ${row.slot_minutes} min`;
      item.innerHTML =
        `<span class="adm-item-main">` +
        `<span class="adm-badge ${row.kind === "blocked" ? "is-block" : "is-open"}">` +
        `${row.kind === "blocked" ? "Blok" : "Extra"}</span>${label}</span>` +
        `<span class="adm-item-actions"></span>`;
      const del = document.createElement("button");
      del.type = "button";
      del.className = "adm-mini-btn is-danger";
      del.textContent = "Verwijder";
      del.addEventListener("click", () => {
        if (!confirm("Deze aanpassing verwijderen?")) return;
        run(() => api("deleteOverride", { id: row.id }));
      });
      item.querySelector(".adm-item-actions").appendChild(del);
      els.overrides.appendChild(item);
    });
  };

  const renderBookings = (rows) => {
    els.bookings.innerHTML = "";
    const upcoming = rows.filter((r) => r.status !== "cancelled");
    const cancelled = rows.filter((r) => r.status === "cancelled");
    if (!rows.length) {
      els.bookings.innerHTML = '<p class="adm-empty">Nog geen boekingen.</p>';
      return;
    }

    const make = (row) => {
      const item = document.createElement("div");
      item.className =
        "adm-item adm-booking" + (row.status === "cancelled" ? " is-inactive" : "");
      const contact = [row.email, row.phone].filter(Boolean).join(" · ");
      item.innerHTML =
        `<span class="adm-item-main">` +
        `<strong>${fmtDate(row.slot_date)} · ${fmtTime(row.slot_time)}</strong> ` +
        `(${row.duration_minutes} min)<br/>` +
        `${row.name} — ${row.treatment || "—"}<br/>` +
        `<small>${contact}${row.notes ? " · " + row.notes : ""}</small></span>` +
        `<span class="adm-item-actions"></span>`;
      const actions = item.querySelector(".adm-item-actions");

      if (row.status !== "cancelled") {
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "adm-mini-btn";
        cancel.textContent = "Annuleren";
        cancel.addEventListener("click", () => {
          if (!confirm(`Afspraak van ${row.name} annuleren?`)) return;
          run(() => api("cancelBooking", { id: row.id }));
        });
        actions.appendChild(cancel);
      }
      const del = document.createElement("button");
      del.type = "button";
      del.className = "adm-mini-btn is-danger";
      del.textContent = "Verwijder";
      del.addEventListener("click", () => {
        if (!confirm("Deze boeking definitief verwijderen?")) return;
        run(() => api("deleteBooking", { id: row.id }));
      });
      actions.appendChild(del);
      return item;
    };

    upcoming.forEach((row) => els.bookings.appendChild(make(row)));
    if (cancelled.length) {
      const head = document.createElement("p");
      head.className = "adm-subhead";
      head.textContent = "Geannuleerd";
      els.bookings.appendChild(head);
      cancelled.forEach((row) => els.bookings.appendChild(make(row)));
    }
  };

  // --- data flow ----------------------------------------------------------
  const refresh = async () => {
    const data = await api("list", {});
    renderSchedules(data.schedules || []);
    renderOverrides(data.overrides || []);
    renderBookings(data.bookings || []);
  };

  // Run an action then refresh, surfacing any error in the feedback bar.
  const run = async (fn) => {
    setFeedback(els.feedback, "");
    try {
      await fn();
      await refresh();
      setFeedback(els.feedback, "Opgeslagen.", "success");
    } catch (error) {
      if (error.message !== "auth") {
        setFeedback(els.feedback, error.message || "Er ging iets mis.", "error");
      }
    }
  };

  const showLogin = (message) => {
    els.dash.hidden = true;
    els.login.hidden = false;
    setFeedback(els.loginFeedback, message || "", message ? "error" : null);
  };

  const showDash = async () => {
    els.login.hidden = true;
    els.dash.hidden = false;
    try {
      await refresh();
    } catch (error) {
      /* handled in api() */
    }
  };

  // --- time fields --------------------------------------------------------
  // Replace each .adm-time placeholder with an hour + minute dropdown, so
  // picking a time is two quick clicks instead of a scroll spinner.
  const buildTimeFields = () => {
    document.querySelectorAll(".adm-time").forEach((host) => {
      const name = host.dataset.time;
      const optional = host.dataset.optional === "1";
      const def = host.dataset.default || "";
      const hourOpts = [];
      if (optional) hourOpts.push('<option value="">—</option>');
      for (let h = 6; h <= 23; h += 1) {
        const v = String(h).padStart(2, "0");
        hourOpts.push(`<option value="${v}">${v}</option>`);
      }
      const minOpts = ["00", "15", "30", "45"]
        .map((m) => `<option value="${m}">${m}</option>`)
        .join("");
      host.innerHTML =
        `<select name="${name}_hour"${optional ? "" : " required"}>` +
        `${hourOpts.join("")}</select>` +
        `<span class="adm-time-sep">:</span>` +
        `<select name="${name}_minute">${minOpts}</select>`;
      if (def) {
        host.querySelector(`[name="${name}_hour"]`).value = def.slice(0, 2);
        host.querySelector(`[name="${name}_minute"]`).value = def.slice(3, 5);
      }
    });
  };
  buildTimeFields();

  // Combine an hour + minute pair from a form into "HH:MM" (or "" if empty).
  const readTime = (fd, name) => {
    const h = fd.get(`${name}_hour`);
    if (!h) return "";
    return `${h}:${fd.get(`${name}_minute`) || "00"}`;
  };

  // --- events -------------------------------------------------------------
  els.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("adm-password");
    password = input.value;
    setFeedback(els.loginFeedback, "Inloggen…");
    try {
      await api("login", {});
      sessionStorage.setItem(STORE_KEY, password);
      input.value = "";
      showDash();
    } catch (error) {
      if (error.message !== "auth") {
        setFeedback(els.loginFeedback, error.message || "Inloggen mislukt.", "error");
      }
    }
  });

  els.logout.addEventListener("click", () => {
    sessionStorage.removeItem(STORE_KEY);
    password = "";
    showLogin();
  });

  els.scheduleForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const fd = new FormData(els.scheduleForm);
    run(() =>
      api("addSchedule", {
        weekday: Number(fd.get("weekday")),
        start_time: readTime(fd, "start"),
        end_time: readTime(fd, "end"),
      })
    );
  });

  els.overrideForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const fd = new FormData(els.overrideForm);
    run(() =>
      api("addOverride", {
        kind: fd.get("kind"),
        date: fd.get("date"),
        start_time: readTime(fd, "time"),
        slot_minutes: Number(fd.get("slot_minutes")) || 60,
      })
    );
  });

  els.blockRangeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(els.blockRangeForm);
    setFeedback(els.feedback, "");
    try {
      const data = await api("blockRange", {
        from: fd.get("from"),
        to: fd.get("to"),
      });
      await refresh();
      const n = data.added || 0;
      setFeedback(
        els.feedback,
        n === 0
          ? "Deze dagen waren al geblokkeerd."
          : `${n} dag${n === 1 ? "" : "en"} geblokkeerd.`,
        "success"
      );
      els.blockRangeForm.reset();
    } catch (error) {
      if (error.message !== "auth") {
        setFeedback(els.feedback, error.message || "Er ging iets mis.", "error");
      }
    }
  });

  // --- boot ---------------------------------------------------------------
  if (password) {
    showDash();
  } else {
    showLogin();
  }
})();
