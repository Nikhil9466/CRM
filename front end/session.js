"use strict";
// The authentication cookie is HttpOnly: JavaScript never reads or stores it.
// This in-memory token is only CSRF protection and cannot authenticate a request.
window.crmSession = (() => {
  for (const store of [localStorage, sessionStorage]) {
    for (const key of [
      "token",
      "user",
      "crm-signed-out",
      "crm-remembered-user",
    ])
      store.removeItem(key);
  }
  let csrfToken = null,
    pending = null;
  function noticeAndGo(message, path) {
    if (message) sessionStorage.setItem("crm-login-message", message);
    location.replace(path);
  }
  function signal(kind) {
    localStorage.setItem(
      "crm-auth-change",
      JSON.stringify({ kind, nonce: crypto.randomUUID() }),
    );
  }
  window.addEventListener("storage", (event) => {
    if (event.key !== "crm-auth-change" || !event.newValue) return;
    let value;
    try {
      value = JSON.parse(event.newValue);
    } catch {
      return;
    }
    if (!["login", "logout"].includes(value.kind)) return;
    csrfToken = null;
    noticeAndGo(
      value.kind === "logout" ? "You were signed out in another tab." : "",
      value.kind === "login" ? "home.html" : "login.html",
    );
  });
  async function ensure() {
    if (csrfToken) return csrfToken;
    if (!pending)
      pending = (async () => {
        const res = await fetch("/api/auth/session", {
          credentials: "same-origin",
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 401) noticeAndGo(data.error, "login.html");
          throw new Error(data.error || "Could not load your session.");
        }
        csrfToken = data.csrfToken;
        return csrfToken;
      })().finally(() => {
        pending = null;
      });
    return pending;
  }
  async function request(path, options = {}, authenticated = true) {
    const protection = authenticated ? await ensure() : null;
    const res = await fetch(path, {
      ...options,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        ...options.headers,
        "X-CRM-Request": "1",
        ...(protection ? { "X-CSRF-Token": protection } : {}),
      },
    });
    if (authenticated && (res.status === 401 || res.status === 403)) {
      const data = await res
        .clone()
        .json()
        .catch(() => ({}));
      if (res.status === 401) {
        noticeAndGo(data.error || "Please sign in again.", "login.html");
        throw new Error(data.error || "Please sign in again.");
      }
      if (data.code === "SESSION_CHANGED") {
        csrfToken = null;
        location.replace("home.html");
        throw new Error(
          "The browser account changed. Reloading your workspace.",
        );
      }
    }
    return res;
  }
  function signedIn(data) {
    csrfToken = data.csrfToken;
    signal("login");
  }
  function signedOut() {
    csrfToken = null;
    signal("logout");
  }
  async function logout() {
    const res = await request("/api/auth/logout", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error("Could not sign out. Please retry.");
    signedOut();
    location.replace("login.html");
  }
  return { request, signedIn, signedOut, logout };
})();
