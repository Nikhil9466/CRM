const { headers, attachSession } = require("./helpers/client");
// Run only against a dedicated disposable database, never the user's CRM data.
const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const enabled = process.env.CRM_TEST_DATABASE_URL;
if (enabled) process.env.DATABASE_URL = enabled;
test(
  "teams: approval workflow, role boundaries, scoped CRUD/search/reports and profile",
  { skip: !enabled, timeout: 90000 },
  async () => {
    const app = require("../src/app"),
      prisma = require("../src/config/prisma");
    const server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const base = "http://127.0.0.1:" + server.address().port + "/api";
    const suffix = randomUUID().slice(0, 8),
      orgId = "teams-" + suffix;
    let counter = 0;
    async function api(path, session, method = "GET", body, status = 200) {
      const res = await fetch(base + path, {
        method,
        headers: headers(session),
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = res.status === 204 ? null : await res.json();
      assert.equal(
        res.status,
        status,
        `${method} ${path}: ${JSON.stringify(data)}`,
      );
      return attachSession(data, res);
    }
    function account(name) {
      return {
        name,
        email: `${name}-${suffix}@example.test`,
        phone: "91" + String(Date.now() + counter++).slice(-8),
        password: "TeamPassword!123",
      };
    }
    try {
      const admin = await api(
        "/auth/signup",
        null,
        "POST",
        { ...account("Admin"), orgId },
        201,
      );
      const at = admin.session;
      async function member(name) {
        const body = account(name);
        const user = await api("/members", at, "POST", body, 201);
        const login = await api("/auth/login", null, "POST", {
          email: body.email,
          password: body.password,
        });
        return { ...user, session: login.session };
      }
      const l1 = await member("Leader1"),
        l2 = await member("Leader2"),
        e1 = await member("Employee1"),
        e2 = await member("Employee2"),
        spare = await member("Spare");
      const t1 = await api(
        "/teams",
        at,
        "POST",
        { name: "Alpha", leaderId: l1.id },
        201,
      );
      const t2 = await api(
        "/teams",
        at,
        "POST",
        { name: "Beta", leaderId: l2.id },
        201,
      );
      await api(`/teams/${t1.id}/members`, at, "POST", { employeeId: e1.id });
      await api(`/teams/${t2.id}/members`, at, "POST", { employeeId: e2.id });
      const profile = await api("/me", l1.session);
      assert.equal(profile.role, "SUB_ADMIN");
      assert.equal(profile.team.name, "Alpha");
      assert.equal(
        profile.phone,
        l1.phone ||
          (await prisma.user.findUnique({ where: { id: l1.id } })).phone,
      );
      assert.ok(profile.createdAt);
      assert.equal(profile.passwordHash, undefined);
      assert.equal((await api("/members", l1.session)).length, 2);
      assert.equal((await api("/members", e1.session)).length, 1);
      await api("/teams", e1.session, "GET", null, 403);
      await api("/performance", e1.session, "GET", null, 403);
      await api("/members", l1.session, "POST", account("Forbidden"), 403);
      await api(
        "/members/" + e1.id,
        l1.session,
        "PATCH",
        { role: "ADMIN" },
        403,
      );
      await api(
        "/teams",
        l1.session,
        "POST",
        { name: "Nope", leaderId: spare.id },
        403,
      );
      await api(
        `/teams/${t1.id}/members`,
        l1.session,
        "POST",
        { employeeId: spare.id },
        403,
      );
      await api(
        `/teams/${t2.id}/members/${e2.id}`,
        l1.session,
        "DELETE",
        null,
        403,
      );
      await api(
        `/teams/${t2.id}/requests`,
        l1.session,
        "POST",
        { employeeId: spare.id },
        403,
      );
      await api("/members/" + e1.id, at, "PATCH", { role: "SUB_ADMIN" }, 400);
      const request = await api(
        `/teams/${t1.id}/requests`,
        l1.session,
        "POST",
        { employeeId: spare.id },
        201,
      );
      assert.equal((await api("/me", spare.session)).teamId, null);
      await api(
        `/teams/${t1.id}/requests`,
        l1.session,
        "POST",
        { employeeId: spare.id },
        409,
      );
      await api(
        "/team-requests/" + request.id,
        l1.session,
        "PATCH",
        { status: "APPROVED" },
        403,
      );
      await api("/team-requests/" + request.id, at, "PATCH", {
        status: "APPROVED",
      });
      await api(
        "/team-requests/" + request.id,
        at,
        "PATCH",
        { status: "APPROVED" },
        409,
      );
      assert.equal((await api("/me", spare.session)).teamId, t1.id);
      await api(
        `/teams/${t1.id}/members/${spare.id}`,
        l1.session,
        "DELETE",
        null,
        204,
      );
      assert.equal((await api("/me", spare.session)).active, true);
      assert.equal((await api("/me", spare.session)).teamId, null);
      const reject = await api(
        `/teams/${t1.id}/requests`,
        l1.session,
        "POST",
        { employeeId: spare.id },
        201,
      );
      await api("/team-requests/" + reject.id, at, "PATCH", {
        status: "REJECTED",
      });
      assert.equal((await api("/me", spare.session)).teamId, null);
      const stages = await api("/stages", at),
        won = stages.find((s) => s.kind === "WON");
      const c1 = await api(
        "/contacts",
        l1.session,
        "POST",
        { name: "Alpha contact", assigneeId: e1.id },
        201,
      );
      const c2 = await api(
        "/contacts",
        l2.session,
        "POST",
        { name: "Beta secret", assigneeId: e2.id },
        201,
      );
      const d1 = await api(
        "/deals",
        l1.session,
        "POST",
        {
          title: "Alpha deal",
          contactId: c1.id,
          stageId: won.id,
          value: "1250.50",
        },
        201,
      );
      const d2 = await api(
        "/deals",
        l2.session,
        "POST",
        {
          title: "Beta secret deal",
          contactId: c2.id,
          stageId: won.id,
          value: "9000",
        },
        201,
      );
      const task1 = await api(
        "/tasks",
        l1.session,
        "POST",
        {
          title: "Alpha task",
          assigneeId: e1.id,
          contactId: c1.id,
          completed: true,
        },
        201,
      );
      const task2 = await api(
        "/tasks",
        l2.session,
        "POST",
        { title: "Beta secret task", assigneeId: e2.id, contactId: c2.id },
        201,
      );
      for (const [type, id] of [
        ["contacts", c2.id],
        ["deals", d2.id],
        ["tasks", task2.id],
      ]) {
        for (const tok of [l1.session, e1.session]) {
          await api(`/${type}/${id}`, tok, "GET", null, 404);
          await api(
            `/${type}/${id}`,
            tok,
            "PATCH",
            { name: "Hacked", title: "Hacked" },
            404,
          );
        }
        await api(`/${type}/${id}`, l1.session, "DELETE", null, 404);
        assert.equal((await api("/" + type, l1.session)).total, 1);
      }
      await api(
        "/contacts",
        l1.session,
        "POST",
        { name: "Escape", assigneeId: e2.id },
        404,
      );
      await api(
        "/contacts/" + c1.id,
        l1.session,
        "PATCH",
        { name: "Escape", assigneeId: e2.id },
        404,
      );
      await api(
        "/deals",
        l1.session,
        "POST",
        { title: "Escape", contactId: c2.id, stageId: won.id, value: "1" },
        404,
      );
      await api(
        "/tasks",
        l1.session,
        "POST",
        { title: "Escape", contactId: c2.id },
        404,
      );
      await api(
        "/tasks",
        l1.session,
        "POST",
        { title: "Escape", assigneeId: e2.id },
        403,
      );
      await api(
        "/tasks",
        at,
        "POST",
        { title: "Inconsistent owner", assigneeId: e2.id, contactId: c1.id },
        400,
      );
      assert.equal(
        (await api("/contacts?assigneeId=" + e2.id, l1.session)).total,
        0,
      );
      const search = await api("/search?q=secret", l1.session);
      assert.deepEqual(search, { contacts: [], deals: [], tasks: [] });
      const dash = await api("/dashboard", l1.session);
      assert.equal(dash.kpis.contacts, 1);
      assert.equal(Number(dash.kpis.wonThisMonth), 1250.5);
      assert.equal(dash.monthly.at(-1).count, 1);
      const perf = await api("/performance", at);
      assert.equal(perf.teams.length, 2);
      const alpha = perf.teams.find((t) => t.id === t1.id);
      assert.equal(alpha.contacts, 1);
      assert.equal(alpha.won, 1);
      assert.equal(alpha.revenue, "1250.5");
      assert.equal(alpha.completed, 1);
      assert.equal((await api("/performance", l1.session)).teams.length, 1);
      assert.equal(
        (await api("/performance", l1.session)).employees.some(
          (e) => e.id === e2.id,
        ),
        false,
      );
      // Removing a member immediately revokes the leader's access to their work.
      await api(
        `/teams/${t1.id}/members/${e1.id}`,
        l1.session,
        "DELETE",
        null,
        204,
      );
      await api("/contacts/" + c1.id, l1.session, "GET", null, 404);
      assert.equal((await api("/contacts/" + c1.id, e1.session)).id, c1.id);
      assert.equal(
        (await api("/performance", l1.session)).teams[0].contacts,
        0,
      );
      await api(`/teams/${t1.id}/members`, at, "POST", { employeeId: e1.id });
      await api("/tasks/" + task1.id, l1.session, "DELETE", null, 204);
      await api("/deals/" + d1.id, l1.session, "DELETE", null, 204);
      await api("/contacts/" + c1.id, l1.session, "DELETE", null, 204);
      // Only admin can replace a leader. Old leader loses authority immediately.
      await api("/teams/" + t1.id, at, "PATCH", { leaderId: e1.id });
      assert.equal((await api("/me", l1.session)).role, "EMPLOYEE");
      await api("/performance", l1.session, "GET", null, 403);
      assert.equal((await api("/me", e1.session)).role, "SUB_ADMIN");
      // Concurrent approval cannot review the same request twice.
      const r = await api(
        `/teams/${t1.id}/requests`,
        e1.session,
        "POST",
        { employeeId: spare.id },
        201,
      );
      const statuses = await Promise.all(
        [1, 2].map(() =>
          fetch(base + "/team-requests/" + r.id, {
            method: "PATCH",
            headers: headers(at),
            body: JSON.stringify({ status: "APPROVED" }),
          }).then((r) => r.status),
        ),
      );
      assert.deepEqual(statuses.sort(), [200, 409]);
    } finally {
      const where = { orgId };
      await prisma.activity.deleteMany({ where });
      await prisma.task.deleteMany({ where });
      await prisma.deal.deleteMany({ where });
      await prisma.contact.deleteMany({ where });
      await prisma.teamRequest.deleteMany({ where });
      await prisma.user.deleteMany({ where });
      await prisma.team.deleteMany({ where });
      await prisma.stage.deleteMany({ where });
      await prisma.organisation.deleteMany({ where: { id: orgId } });
      await prisma.$disconnect();
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
  },
);
