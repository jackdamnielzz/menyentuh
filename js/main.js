// Mobile navigation
const navToggle = document.querySelector(".nav-toggle");
const nav = document.querySelector(".nav");

// Create overlay element
const overlay = document.createElement("div");
overlay.className = "nav-overlay";
document.body.appendChild(overlay);

const openNav = () => {
  nav.classList.add("is-open");
  overlay.classList.add("is-visible");
  navToggle.setAttribute("aria-expanded", "true");
  navToggle.setAttribute("aria-label", "Menu sluiten");
  document.body.style.overflow = "hidden";
};

const closeNav = () => {
  nav.classList.remove("is-open");
  overlay.classList.remove("is-visible");
  navToggle.setAttribute("aria-expanded", "false");
  navToggle.setAttribute("aria-label", "Menu openen");
  document.body.style.overflow = "";
};

if (navToggle) {
  navToggle.addEventListener("click", () => {
    const isOpen = nav.classList.contains("is-open");
    if (isOpen) {
      closeNav();
    } else {
      openNav();
    }
  });
}

overlay.addEventListener("click", closeNav);

// Close nav on escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && nav.classList.contains("is-open")) {
    closeNav();
    navToggle.focus();
  }
});

// Close nav when clicking a link
nav.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", closeNav);
});

// Appointment booking functionality
const slotButtons = document.querySelectorAll("[data-slot]");
const dayButtons = document.querySelectorAll("[data-day]");
const selectedSlotField = document.querySelector("[data-selected-slot]");
const selectedDayField = document.querySelector("[data-selected-day]");
const whatsappButtons = document.querySelectorAll("[data-whatsapp]");
const mailtoButton = document.querySelector("[data-mailto]");

const updateSlotsForDay = (day) => {
  slotButtons.forEach((button) => {
    const slotDay = button.dataset.slotDay;
    if (slotDay === day) {
      button.classList.remove("is-hidden");
    } else {
      button.classList.add("is-hidden");
      button.classList.remove("is-selected");
    }
  });
  if (selectedSlotField) {
    selectedSlotField.value = "";
  }
};

const buildMessage = () => {
  const name = document.querySelector("[name='naam']")?.value?.trim() || "";
  const email = document.querySelector("[name='email']")?.value?.trim() || "";
  const phone = document.querySelector("[name='telefoon']")?.value?.trim() || "";
  const treatment = document.querySelector("[name='behandeling']")?.value || "";
  const message = document.querySelector("[name='bericht']")?.value?.trim() || "";
  const slot = selectedSlotField?.value || "";
  const day = selectedDayField?.value || "";

  const parts = [
    `Naam: ${name}`,
    `E-mail: ${email}`,
    `Telefoon: ${phone}`,
    `Behandeling: ${treatment}`,
    `Voorkeur dag: ${day}`,
    `Voorkeur tijdslot: ${slot}`,
    `Bericht: ${message}`,
  ];

  return parts.join("\n");
};

// Validate required fields
const validateForm = () => {
  const name = document.querySelector("[name='naam']");
  const email = document.querySelector("[name='email']");

  let isValid = true;

  if (name && !name.value.trim()) {
    name.focus();
    isValid = false;
  } else if (email && !email.value.trim()) {
    email.focus();
    isValid = false;
  } else if (email && !email.validity.valid) {
    email.focus();
    isValid = false;
  }

  return isValid;
};

slotButtons.forEach((button) => {
  button.addEventListener("click", () => {
    slotButtons.forEach((btn) => btn.classList.remove("is-selected"));
    button.classList.add("is-selected");
    if (selectedSlotField) {
      selectedSlotField.value = button.dataset.slot;
    }
  });
});

dayButtons.forEach((button) => {
  button.addEventListener("click", () => {
    dayButtons.forEach((btn) => btn.classList.remove("is-selected"));
    button.classList.add("is-selected");
    if (selectedDayField) {
      selectedDayField.value = button.dataset.day;
    }
    updateSlotsForDay(button.dataset.day);
  });
});

if (selectedDayField?.value) {
  updateSlotsForDay(selectedDayField.value);
}

whatsappButtons.forEach((button) => {
  button.addEventListener("click", (event) => {
    if (!validateForm()) {
      event.preventDefault();
      return;
    }
    const message = encodeURIComponent(buildMessage());
    const whatsappNumber = button.dataset.whatsapp;
    button.href = `https://wa.me/${whatsappNumber}?text=${message}`;
    if (!whatsappNumber) {
      event.preventDefault();
    }
  });
});

if (mailtoButton) {
  mailtoButton.addEventListener("click", (event) => {
    if (!validateForm()) {
      event.preventDefault();
      return;
    }
    const subject = encodeURIComponent("Afspraakaanvraag – Menyentuh");
    const body = encodeURIComponent(buildMessage());
    const target = mailtoButton.dataset.mailto;
    mailtoButton.href = `mailto:${target}?subject=${subject}&body=${body}`;
  });
}

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", function (e) {
    const targetId = this.getAttribute("href");
    if (targetId === "#") return;

    const target = document.querySelector(targetId);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  });
});
