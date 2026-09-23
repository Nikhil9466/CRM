"use strict";
const mode = document.body.dataset.mode;
document.documentElement.dataset.theme = localStorage.getItem("vb-theme") || "light";
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
  const remember = body.remember;
  delete body.remember;
  const sessionToken = window.crmSession.token();
  if (mode === "password" && !sessionToken) {
    location.href = "login.html";
    return;
  }
  button.disabled = true;
  error.hidden = true;
  try {
    const res = await fetch(mode === "password" ? "/api/password" : "/api/auth/" + mode, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(mode === "password" ? { Authorization: "Bearer " + sessionToken } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({ error: "The server returned an unexpected response. Please retry." }));
    if (!res.ok) throw new Error(data.error || "Please check your details.");
    if (mode === "password") {
      window.crmSession.clear(sessionToken);
      sessionStorage.setItem("crm-login-message", "Password changed. Sign in with your new password.");
      location.href = "login.html";
      return;
    }
    window.crmSession.save(data.token, Boolean(remember), data.user?.id);
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
