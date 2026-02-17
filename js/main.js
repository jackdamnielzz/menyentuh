// Mobile navigation
const navToggle = document.querySelector(".nav-toggle");
const nav = document.querySelector(".nav");
const canUseMobileNav = Boolean(navToggle && nav);
const MOBILE_NAV_BREAKPOINT = 900;
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
    if (window.innerWidth > MOBILE_NAV_BREAKPOINT && nav.classList.contains("is-open")) {
      closeNav();
    }
  });
}

// Contact form (direct submit + WhatsApp prefill)
const contactForm = document.querySelector("#contact-form-form");
const whatsappButtons = document.querySelectorAll("[data-whatsapp]");
const feedback = document.querySelector("#form-feedback");

const setFeedback = (text, type = "error") => {
  if (!feedback) return;
  feedback.textContent = text;
  feedback.classList.add("is-visible");
  feedback.classList.toggle("is-error", type === "error");
  feedback.classList.toggle("is-success", type === "success");
};

const clearFeedback = () => {
  if (!feedback) return;
  feedback.classList.remove("is-visible", "is-error", "is-success");
  feedback.textContent = "";
};

const buildMessage = () => {
  const name = document.querySelector("[name='naam']")?.value?.trim() || "";
  const email = document.querySelector("[name='email']")?.value?.trim() || "";
  const phone = document.querySelector("[name='telefoon']")?.value?.trim() || "";
  const subject = document.querySelector("[name='onderwerp']")?.value || "";
  const message = document.querySelector("[name='bericht']")?.value?.trim() || "";

  const parts = [
    `Naam: ${name}`,
    `E-mail: ${email}`,
    `Telefoon: ${phone}`,
    `Onderwerp: ${subject}`,
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
  clearFeedback();

  if (name && !name.value.trim()) {
    setFeedback("Vul je naam in.", "error");
    name.focus();
    return false;
  }

  if (email && !email.value.trim()) {
    setFeedback("Vul je e-mailadres in.", "error");
    email.focus();
    return false;
  }

  if (email && !email.validity.valid) {
    setFeedback("Vul een geldig e-mailadres in.", "error");
    email.focus();
    return false;
  }

  if (subject && !subject.value) {
    setFeedback("Kies een onderwerp.", "error");
    subject.focus();
    return false;
  }

  if (message && !message.value.trim()) {
    setFeedback("Schrijf een kort bericht.", "error");
    message.focus();
    return false;
  }

  return true;
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

if (contactForm) {
  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    const submitButton = contactForm.querySelector("[data-submit-button]");
    const originalButtonText = submitButton?.textContent || "Verstuur bericht";
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Versturen...";
    }

    setFeedback("Bericht wordt verstuurd...", "success");

    try {
      const formData = new FormData(contactForm);
      const action = contactForm.getAttribute("action") || "";
      const endpoint = action.includes("formsubmit.co/")
        ? action.replace("formsubmit.co/", "formsubmit.co/ajax/")
        : action;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Form submission failed");
      }

      contactForm.reset();
      setFeedback("Dankjewel. Je bericht is verstuurd naar info@menyentuh.nl.", "success");
    } catch (error) {
      setFeedback("Versturen lukt nu niet. Probeer het later opnieuw of gebruik WhatsApp.", "error");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
      }
    }
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
