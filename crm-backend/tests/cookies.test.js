const test = require("node:test"),
  assert = require("node:assert/strict"),
  { randomUUID } = require("node:crypto");
const { headers, attachSession } = require("./helpers/client");
const enabled = process.env.CRM_TEST_DATABASE_URL;
if (enabled) process.env.DATABASE_URL = enabled;
test(
  "cookie sessions: lifecycle, CSRF, expiration, revocation and production flags",
  { skip: !enabled, timeout: 90000 },
  async () => {
    const app = require("../src/app"),
      p = require("../src/config/prisma"),
      s = require("../src/utils/sessions");
    const server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const base = "http://127.0.0.1:" + server.address().port,
      orgId = "cookie-" + randomUUID();
    const password = "CookiePassword!123";
    let user;
    async function send(path, session, method = "GET", body, extra = {}) {
      const res = await fetch(base + "/api" + path, {
        method,
        headers: { ...headers(session), ...extra },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = res.status === 204 ? null : await res.json();
      return { res, data: attachSession(data, res) };
    }
    try {
      await p.organisation.create({ data: { id: orgId } });
      user = await p.user.create({
        data: {
          name: "Cookie Tester",
          orgId,
          email: randomUUID() + "@example.test",
          phone: "79" + String(Date.now()).slice(-8),
          role: "ADMIN",
          passwordHash: await require("bcrypt").hash(password, 4),
        },
      });
      const credentials = { email: user.email, password };
      let result = await send("/auth/login", null, "POST", credentials, {
        "X-CRM-Request": "",
      });
      assert.equal(result.res.status, 403);
      result = await send("/auth/login", null, "POST", credentials, {
        Origin: "https://evil.example",
      });
      assert.equal(result.res.status, 403);
      result = await send("/auth/login", null, "POST", credentials, {
        "Sec-Fetch-Site": "cross-site",
      });
      assert.equal(result.res.status, 403);
      result = await send("/auth/login", null, "POST", {
        ...credentials,
        remember: "false",
      });
      assert.equal(result.res.status, 400);
      const login = await send("/auth/login", null, "POST", credentials);
      assert.equal(login.res.status, 200);
      const cookie = login.res.headers.get("set-cookie");
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /SameSite=Lax/i);
      assert.match(cookie, /Path=\//);
      assert.doesNotMatch(cookie, /Max-Age|Expires|Domain/i);
      assert.equal(login.data.token, undefined);
      const first = login.data.session;
      const id = first.cookie.split("=")[1],
        row = await p.session.findUnique({ where: { idHash: s.digest(id) } });
      assert.ok(row);
      assert.notEqual(row.idHash, id);
      assert.equal(row.userId, user.id);
      const boot = await send("/auth/session", {
        cookie: first.cookie,
        csrfToken: "",
      });
      assert.equal(boot.res.status, 200);
      assert.equal(boot.data.csrfToken, first.csrfToken);
      for (const token of ["", "bad", "a".repeat(64)]) {
        result = await send(
          "/auth/logout",
          { ...first, csrfToken: token },
          "POST",
        );
        assert.equal(result.res.status, 403);
      }
      result = await send("/me", null, "GET", null, {
        Authorization: "Bearer " + id,
      });
      assert.equal(result.res.status, 401);
      result = await send("/me", {
        ...first,
        cookie: first.cookie + "; " + first.cookie,
      });
      assert.equal(result.res.status, 401);
      const second = await send("/auth/login", first, "POST", {
        ...credentials,
        remember: true,
      });
      assert.equal(second.res.status, 200);
      assert.match(second.res.headers.get("set-cookie"), /Max-Age=604800/);
      assert.notEqual(second.data.session.cookie, first.cookie);
      assert.equal((await send("/me", first)).res.status, 401);
      const fresh = second.data.session;
      result = await send(
        "/auth/logout",
        { ...fresh, csrfToken: first.csrfToken },
        "POST",
      );
      assert.equal(result.res.status, 403);
      assert.equal(result.data.code, "SESSION_CHANGED");
      assert.equal((await send("/me", fresh)).res.status, 200);
      result = await send("/auth/logout", fresh, "POST");
      assert.equal(result.res.status, 204);
      assert.match(
        result.res.headers.get("set-cookie"),
        /Expires=Thu, 01 Jan 1970/,
      );
      assert.equal((await send("/me", fresh)).res.status, 401);
      const expired = (await send("/auth/login", null, "POST", credentials))
        .data.session;
      await p.session.update({
        where: { idHash: s.digest(expired.cookie.split("=")[1]) },
        data: { expiresAt: new Date(0) },
      });
      assert.equal((await send("/me", expired)).res.status, 401);
      const oldEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = "production";
        assert.equal(s.cookieName(), "__Host-crm_session");
        assert.equal(s.cookieOptions().secure, true);
        assert.equal(s.cookieOptions().httpOnly, true);
        assert.equal(s.cookieOptions().domain, undefined);
      } finally {
        if (oldEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = oldEnv;
      }
    } finally {
      await p.user.deleteMany({ where: { orgId } });
      await p.organisation.deleteMany({ where: { id: orgId } });
      await p.$disconnect();
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
  },
);
