// Mobile navigation
const navToggle = document.querySelector(".nav-toggle");
const nav = document.querySelector(".nav");
const canUseMobileNav = Boolean(navToggle && nav);
let overlay = null;

const openNav = () => {
  if (!canUseMobileNav || !overlay) return;
  nav.classList.add("is-open");
  overlay.classList.add("is-visible");
  overlay.setAttribute("aria-hidden", "false");
  navToggle.setAttribute("aria-expanded", "true");
  navToggle.setAttribute("aria-label", "Menu sluiten");
  document.body.style.overflow = "hidden";
};

const closeNav = () => {
  if (!canUseMobileNav || !overlay) return;
  nav.classList.remove("is-open");
  overlay.classList.remove("is-visible");
  overlay.setAttribute("aria-hidden", "true");
  navToggle.setAttribute("aria-expanded", "false");
  navToggle.setAttribute("aria-label", "Menu openen");
  document.body.style.overflow = "";
};

if (canUseMobileNav) {
  // Create overlay element
  overlay = document.createElement("div");
  overlay.className = "nav-overlay";
  overlay.setAttribute("aria-hidden", "true");
  document.body.appendChild(overlay);

  navToggle.addEventListener("click", () => {
    const isOpen = nav.classList.contains("is-open");
    if (isOpen) {
      closeNav();
    } else {
      openNav();
    }
  });

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

  // Ensure desktop state is reset when viewport grows.
  window.addEventListener("resize", () => {
    if (window.innerWidth > 720 && nav.classList.contains("is-open")) {
      closeNav();
    }
  });
}

// Contact form (mailto + WhatsApp prefill)
const whatsappButtons = document.querySelectorAll("[data-whatsapp]");
const mailtoButton = document.querySelector("[data-mailto]");

const buildMessage = () => {
  const name = document.querySelector("[name='naam']")?.value?.trim() || "";
  const email = document.querySelector("[name='email']")?.value?.trim() || "";
  const phone = document.querySelector("[name='telefoon']")?.value?.trim() || "";
  const subject = document.querySelector("[name='onderwerp']")?.value || "";
  const treatment = document.querySelector("[name='behandeling']")?.value || "";
  const message = document.querySelector("[name='bericht']")?.value?.trim() || "";

  const parts = [
    `Naam: ${name}`,
    `E-mail: ${email}`,
    `Telefoon: ${phone}`,
    `Onderwerp: ${subject}`,
    `Behandeling: ${treatment}`,
    `Bericht: ${message}`,
  ];

  return parts.join("\n");
};

// Validate required fields
const validateForm = () => {
  const name = document.querySelector("[name='naam']");
  const email = document.querySelector("[name='email']");
  const subject = document.querySelector("[name='onderwerp']");
  const message = document.querySelector("[name='bericht']");
  const feedback = document.querySelector("#form-feedback");

  let isValid = true;

  const setFeedback = (text) => {
    if (!feedback) return;
    feedback.textContent = text;
    feedback.classList.add("is-visible", "is-error");
    feedback.classList.remove("is-success");
  };

  if (feedback) {
    feedback.classList.remove("is-visible", "is-error", "is-success");
    feedback.textContent = "";
  }

  if (name && !name.value.trim()) {
    setFeedback("Vul je naam in.");
    name.focus();
    isValid = false;
  } else if (email && !email.value.trim()) {
    setFeedback("Vul je e-mailadres in.");
    email.focus();
    isValid = false;
  } else if (email && !email.validity.valid) {
    setFeedback("Vul een geldig e-mailadres in.");
    email.focus();
    isValid = false;
  } else if (subject && !subject.value) {
    setFeedback("Kies een onderwerp.");
    subject.focus();
    isValid = false;
  } else if (message && !message.value.trim()) {
    setFeedback("Schrijf een kort bericht.");
    message.focus();
    isValid = false;
  }

  return isValid;
};

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
    const subject = encodeURIComponent("Contact – Menyentuh");
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

// Review filters on reviews page
const reviewFilterButtons = document.querySelectorAll("[data-review-filter]");
const reviewCards = document.querySelectorAll("[data-review-category]");
const reviewResults = document.querySelector("[data-review-results]");

if (reviewFilterButtons.length > 0 && reviewCards.length > 0) {
  const setActiveFilter = (filter) => {
    reviewFilterButtons.forEach((button) => {
      const isActive = button.dataset.reviewFilter === filter;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  };

  const applyReviewFilter = (filter) => {
    let visibleCount = 0;

    reviewCards.forEach((card) => {
      const categories = (card.dataset.reviewCategory || "").split(/\s+/).filter(Boolean);
      const isVisible = filter === "all" || categories.includes(filter);
      card.hidden = !isVisible;
      if (isVisible) visibleCount += 1;
    });

    if (reviewResults) {
      reviewResults.textContent = visibleCount === 1 ? "1 review zichtbaar" : `${visibleCount} reviews zichtbaar`;
    }

    setActiveFilter(filter);
  };

  reviewFilterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.dataset.reviewFilter || "all";
      applyReviewFilter(filter);
    });
  });

  const initialFilter =
    [...reviewFilterButtons].find((button) => button.classList.contains("is-active"))?.dataset
      .reviewFilter || "all";
  applyReviewFilter(initialFilter);
}
