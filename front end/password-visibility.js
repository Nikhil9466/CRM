"use strict";
window.addPasswordToggles = (root = document) => {
  root.querySelectorAll('input[type="password"]').forEach((input) => {
    if (input.dataset.visibilityReady) return;
    input.dataset.visibilityReady = "true";
    input.setAttribute(
      "aria-label",
      input.closest("label")?.textContent.trim() || "Password",
    );
    const wrapper = document.createElement("span");
    wrapper.className = "password-field";
    input.before(wrapper);
    wrapper.append(input);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "text-button password-toggle";
    button.textContent = "Show";
    button.setAttribute(
      "aria-label",
      "Show " +
        (input.name === "currentPassword" ? "current password" : "password"),
    );
    button.setAttribute("aria-pressed", "false");
    button.onclick = () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.textContent = show ? "Hide" : "Show";
      button.setAttribute(
        "aria-label",
        (show ? "Hide " : "Show ") +
          (input.name === "currentPassword" ? "current password" : "password"),
      );
      button.setAttribute("aria-pressed", String(show));
    };
    wrapper.append(button);
  });
};
window.addPasswordToggles();
