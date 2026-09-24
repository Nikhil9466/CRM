"use strict";
const mode = document.body.dataset.mode;
document.documentElement.dataset.theme =
  localStorage.getItem("vb-theme") || "light";
const loginMessage = sessionStorage.getItem("crm-login-message");
if (loginMessage) {
  document.getElementById("authError").textContent = loginMessage;
  document.getElementById("authError").hidden = false;
  sessionStorage.removeItem("crm-login-message");
}
document.getElementById("authForm").onsubmit = async (e) => {
  e.preventDefault();
  const button = document.getElementById("authSubmit"),
    error = document.getElementById("authError");
  const body = Object.fromEntries(new FormData(e.target));
  if (mode !== "password") body.remember = Boolean(body.remember);
  button.disabled = true;
  error.hidden = true;
  try {
    const res = await window.crmSession.request(
      mode === "password" ? "/api/password" : "/api/auth/" + mode,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      },
      mode === "password",
    );
    const data = await res.json().catch(() => ({
      error: "The server returned an unexpected response. Please retry.",
    }));
    if (!res.ok) throw new Error(data.error || "Please check your details.");
    if (mode === "password") {
      window.crmSession.signedOut();
      sessionStorage.setItem(
        "crm-login-message",
        "Password changed. Sign in with your new password.",
      );
      location.href = "login.html";
      return;
    }
    window.crmSession.signedIn(data);
    location.href = "home.html";
  } catch (err) {
    error.textContent =
      err instanceof TypeError || err.name === "TimeoutError"
        ? "Cannot reach the server. Open this app at http://localhost:4000 after starting the backend."
        : err.message;
    error.hidden = false;
  } finally {
    button.disabled = false;
  }
};
