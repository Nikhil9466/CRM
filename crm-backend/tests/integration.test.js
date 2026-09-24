const { headers, attachSession } = require("./helpers/client");
// Use only a dedicated disposable test database. Does not use your .env file.
const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const enabled = process.env.CRM_TEST_DATABASE_URL;
if (enabled) process.env.DATABASE_URL = enabled;
test(
  "CRM API integration: auth, isolation, CRUD, reports and permissions",
  { skip: !enabled, timeout: 90000 },
  async (t) => {
    const app = require("../src/app"),
      prisma = require("../src/config/prisma");
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = "http://127.0.0.1:" + server.address().port + "/api";
    const suffix = randomUUID().slice(0, 8);
    const orgs = ["test-a-" + suffix, "test-b-" + suffix];
    const num = String(Date.now()).slice(-7);
    async function request(
      path,
      method = "GET",
      body,
      session,
      expected = 200,
    ) {
      const res = await fetch(base + path, {
        method,
        headers: headers(session),
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = res.status === 204 ? null : await res.json();
      assert.equal(res.status, expected, path + ": " + JSON.stringify(data));
      return attachSession(data, res);
    }
    const account = (i, orgId) => ({
      name: "Test " + i,
      email: i + suffix + "@example.com",
      phone: "80" + i + num,
      password: "TestPassword!123",
      orgId,
    });
    try {
      await request("/dashboard", "GET", null, null, 401);
      const a = await request(
        "/auth/signup",
        "POST",
        account(1, orgs[0]),
        null,
        201,
      );
      const b = await request(
        "/auth/signup",
        "POST",
        account(2, orgs[1]),
        null,
        201,
      );
      assert.equal(a.user.role, "ADMIN");
      assert.equal(a.user.passwordHash, undefined);
      await request("/auth/signup", "POST", account(3, orgs[0]), null, 409);
      const member = await request(
        "/members",
        "POST",
        account(3),
        a.session,
        201,
      );
      const u = await request("/auth/login", "POST", {
        email: member.email,
        password: "TestPassword!123",
      });
      assert.equal(u.user.role, "EMPLOYEE");
      await request("/members", "POST", account(4), u.session, 403);
      await request(
        "/members/" + a.user.id,
        "PATCH",
        { role: "EMPLOYEE" },
        a.session,
        400,
      );
      const c = await request(
        "/contacts",
        "POST",
        {
          name: "<img src=x onerror=alert(1)>",
          email: "contact@example.com",
          company: "Test Co",
          assigneeId: member.id,
        },
        a.session,
        201,
      );
      const foreign = await request(
        "/contacts",
        "POST",
        { name: "Private contact" },
        b.session,
        201,
      );
      await request("/contacts/" + foreign.id, "GET", null, a.session, 404);
      await request(
        "/contacts/" + foreign.id,
        "PATCH",
        { name: "stolen" },
        a.session,
        404,
      );
      await request("/contacts/" + foreign.id, "DELETE", null, a.session, 404);
      await request(
        "/contacts",
        "POST",
        { name: "Invalid assignment", assigneeId: b.user.id },
        a.session,
        404,
      );
      await request(
        "/contacts",
        "POST",
        { name: "Forbidden assignment", assigneeId: a.user.id },
        u.session,
        403,
      );
      assert.equal(
        (await request("/contacts", "GET", null, a.session)).total,
        1,
      );
      const stages = await request("/stages", "GET", null, a.session);
      const open = stages.find((s) => s.kind === "OPEN"),
        won = stages.find((s) => s.kind === "WON");
      const d = await request(
        "/deals",
        "POST",
        {
          title: "Test contract",
          contactId: c.id,
          stageId: open.id,
          value: "1234.50",
          expectedCloseDate: "2026-12-01",
        },
        a.session,
        201,
      );
      await request(
        "/deals",
        "POST",
        {
          title: "Cross org",
          contactId: foreign.id,
          stageId: open.id,
          value: "10",
        },
        a.session,
        404,
      );
      await request("/deals/" + d.id, "PATCH", { value: "-1" }, a.session, 400);
      await request("/deals/" + d.id, "DELETE", null, u.session, 403);
      await request("/contacts/" + c.id, "DELETE", null, a.session, 409);
      await request("/deals/" + d.id, "PATCH", { stageId: won.id }, u.session);
      const now = new Date().toISOString().slice(0, 10);
      const task = await request(
        "/tasks",
        "POST",
        { title: "Follow up", dueDate: now, dealId: d.id },
        u.session,
        201,
      );
      let dashboard = await request(
        "/dashboard?today=" + now,
        "GET",
        null,
        a.session,
      );
      assert.equal(dashboard.kpis.contacts, 1);
      assert.equal(dashboard.kpis.activeDeals, 0);
      assert.equal(Number(dashboard.kpis.wonThisMonth), 1234.5);
      assert.equal(dashboard.monthly.at(-1).count, 1);
      assert.equal(dashboard.dueCount, 1);
      await request(
        "/tasks/" + task.id,
        "PATCH",
        { completed: true },
        u.session,
      );
      assert.equal(
        (await request("/dashboard?today=" + now, "GET", null, a.session))
          .dueCount,
        0,
      );
      await request("/deals/" + d.id, "PATCH", { stageId: open.id }, a.session);
      dashboard = await request("/dashboard", "GET", null, a.session);
      assert.equal(Number(dashboard.kpis.wonThisMonth), 0);
      assert.equal(dashboard.kpis.activeDeals, 1);
      assert.equal(
        (await request("/search?q=Test", "GET", null, a.session)).deals.length,
        1,
      );
      assert.equal(
        (await request("/search?q=Private", "GET", null, a.session)).contacts
          .length,
        0,
      );
      const custom = await request(
        "/stages",
        "POST",
        { name: "Negotiation", position: 3, kind: "OPEN" },
        a.session,
        201,
      );
      await request("/stages", "POST", { name: "Forbidden" }, u.session, 403);
      await request(
        "/stages/" + custom.id,
        "PATCH",
        { name: "Final review", position: 4 },
        a.session,
      );
      await request("/stages/" + custom.id, "DELETE", null, a.session, 204);
      await request(
        "/auth/reset-password",
        "POST",
        { email: a.user.email, orgId: orgs[0], password: "HijackPassword123" },
        null,
        410,
      );
      await request(
        "/members/" + member.id,
        "PATCH",
        { active: false },
        a.session,
      );
      await request("/me", "GET", null, u.session, 401);
      await request(
        "/members/" + member.id,
        "PATCH",
        { active: true },
        a.session,
      );
      await request("/me", "GET", null, u.session, 401);
      const u2 = await request("/auth/login", "POST", {
        email: member.email,
        password: "TestPassword!123",
      });
      await request(
        "/password",
        "POST",
        {
          currentPassword: "TestPassword!123",
          password: "NewSecurePassword!12",
        },
        u2.session,
      );
      await request("/me", "GET", null, u2.session, 401);
      await request("/tasks/" + task.id, "DELETE", null, a.session, 204);
      await request("/deals/" + d.id, "DELETE", null, a.session, 204);
      await request("/contacts/" + c.id, "DELETE", null, a.session, 204);
    } finally {
      const where = { orgId: { in: orgs } };
      await prisma.activity.deleteMany({ where });
      await prisma.task.deleteMany({ where });
      await prisma.deal.deleteMany({ where });
      await prisma.contact.deleteMany({ where });
      await prisma.stage.deleteMany({ where });
      await prisma.user.deleteMany({ where });
      await prisma.organisation.deleteMany({ where: { id: { in: orgs } } });
      await prisma.$disconnect();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
