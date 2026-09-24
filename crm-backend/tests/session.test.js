const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(
  path.join(__dirname, "../../front end/session.js"),
  "utf8",
);
function storage() {
  const values = new Map();
  return {
    values,
    getItem: (k) => values.get(k) || null,
    setItem: (k, v) => values.set(k, String(v)),
    removeItem: (k) => values.delete(k),
  };
}
function tab(fetch, localStorage = storage()) {
  const events = {},
    redirects = [],
    sessionStorage = storage();
  const context = {
    window: { addEventListener: (k, f) => (events[k] = f) },
    localStorage,
    sessionStorage,
    fetch,
    AbortSignal,
    crypto: require("node:crypto").webcrypto,
    location: { replace: (p) => redirects.push(p) },
  };
  vm.runInNewContext(source, context);
  return {
    session: context.window.crmSession,
    events,
    redirects,
    localStorage,
    sessionStorage,
  };
}
const response = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
test("legacy authentication storage is removed", () => {
  const store = storage();
  store.setItem("token", "old-secret");
  store.setItem("user", "old-user");
  tab(null, store);
  assert.equal(store.getItem("token"), null);
  assert.equal(store.getItem("user"), null);
});
test("session bootstrap is shared by concurrent requests and sends CSRF in memory only", async () => {
  const calls = [];
  const t = tab(async (url, options) => {
    calls.push({ url, options });
    return response(url.endsWith("/session") ? { csrfToken: "csrf" } : {});
  });
  await Promise.all([
    t.session.request("/api/me"),
    t.session.request("/api/contacts"),
  ]);
  assert.equal(calls.filter((c) => c.url.endsWith("/session")).length, 1);
  for (const c of calls.slice(1)) {
    assert.equal(c.options.headers["X-CSRF-Token"], "csrf");
    assert.equal(c.options.credentials, "same-origin");
    assert.equal(c.options.headers.Authorization, undefined);
  }
  assert.equal(t.localStorage.values.size, 0);
  assert.equal(t.sessionStorage.values.size, 0);
});
test("public login sends the request header without requiring a session", async () => {
  const calls = [];
  const t = tab(async (url, options) => {
    calls.push({ url, options });
    return response({});
  });
  await t.session.request("/api/auth/login", { method: "POST" }, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers["X-CRM-Request"], "1");
});
test("account changes notify other tabs without storing credentials", () => {
  const t = tab();
  t.session.signedIn({ csrfToken: "private-csrf" });
  const signal = t.localStorage.getItem("crm-auth-change");
  assert.ok(signal);
  assert.equal(signal.includes("private-csrf"), false);
  t.events.storage({ key: "crm-auth-change", newValue: signal });
  assert.equal(t.redirects.at(-1), "home.html");
  t.events.storage({
    key: "crm-auth-change",
    newValue: JSON.stringify({ kind: "logout" }),
  });
  assert.equal(t.redirects.at(-1), "login.html");
});
test("a stale page is reloaded without replaying its write under another account", async () => {
  let count = 0;
  const t = tab(async () => {
    count++;
    return response({ code: "SESSION_CHANGED" }, 403);
  });
  t.session.signedIn({ csrfToken: "old" });
  await assert.rejects(
    t.session.request("/api/contacts", { method: "POST" }),
    /account changed/,
  );
  assert.equal(count, 1);
  assert.equal(t.redirects.at(-1), "home.html");
});
test("logout waits for server revocation and redirects", async () => {
  let call;
  const t = tab(async (url, options) => {
    call = { url, options };
    return new Response(null, { status: 204 });
  });
  t.session.signedIn({ csrfToken: "csrf" });
  await t.session.logout();
  assert.equal(call.url, "/api/auth/logout");
  assert.equal(call.options.method, "POST");
  assert.equal(t.redirects.at(-1), "login.html");
});
