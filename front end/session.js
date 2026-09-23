"use strict";
// A remembered login is only a starting point for a new tab. Once opened,
// each tab keeps its own account, even if another tab signs in or signs out.
window.crmSession = (() => {
  const signedOut = "crm-signed-out";
  function token() {
    const current = sessionStorage.getItem("token");
    if (current) return current;
    if (sessionStorage.getItem(signedOut)) return null;
    const remembered = localStorage.getItem("token");
    if (remembered) sessionStorage.setItem("token", remembered);
    return remembered;
  }
  function save(value, remember, userId) {
    if (typeof value !== "string" || !value) throw new Error("The server did not return a valid login. Please retry.");
    sessionStorage.setItem("token", value);
    sessionStorage.removeItem(signedOut);
    sessionStorage.removeItem("user");
    if (remember) {
      localStorage.setItem("token", value);
      if (userId) localStorage.setItem("crm-remembered-user", userId);
    } else if (userId && localStorage.getItem("crm-remembered-user") === userId) {
      // Opting out of remembering this tab must not remove another account.
      localStorage.removeItem("token");
      localStorage.removeItem("crm-remembered-user");
    }
    localStorage.removeItem("user");
  }
  function clear(expected = token()) {
    if (token() !== expected) return false; // Ignore stale network responses.
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    sessionStorage.setItem(signedOut, "1");
    if (expected && localStorage.getItem("token") === expected) {
      localStorage.removeItem("token");
      localStorage.removeItem("crm-remembered-user");
      localStorage.removeItem("user");
    }
    return true;
  }
  return { token, save, clear };
})();
