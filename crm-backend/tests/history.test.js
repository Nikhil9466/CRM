const test = require("node:test"),
  assert = require("node:assert/strict"),
  { randomUUID } = require("node:crypto");
const { headers, attachSession } = require("./helpers/client");
const enabled = process.env.CRM_TEST_DATABASE_URL;
if (enabled) process.env.DATABASE_URL = enabled;
test(
  "activity and recycle bin",
  { skip: !enabled, timeout: 120000 },
  async (t) => {
    const app = require("../src/app"),
      p = require("../src/config/prisma");
    const server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const base = "http://127.0.0.1:" + server.address().port + "/api",
      orgId = "history-" + randomUUID(),
      other = orgId + "-other";
    const password = "HistoryTestPassword!123";
    let n = 0;
    async function req(path, session, method = "GET", body, expected = 200) {
      const res = await fetch(base + path, {
        method,
        headers: headers(session),
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = res.status === 204 ? null : await res.json();
      assert.equal(
        res.status,
        expected,
        method + " " + path + ": " + JSON.stringify(data),
      );
      return attachSession(data, res);
    }
    try {
      await p.organisation.createMany({ data: [{ id: orgId }, { id: other }] });
      const hash = await require("bcrypt").hash(password, 4);
      async function person(role, org = orgId) {
        const i = ++n;
        return p.user.create({
          data: {
            orgId: org,
            name: "Person " + i,
            email: randomUUID() + "@example.test",
            phone: "65" + String(Date.now() + i).slice(-8),
            role,
            passwordHash: hash,
          },
        });
      }
      const admin = await person("ADMIN"),
        lead = await person("SUB_ADMIN"),
        emp = await person("EMPLOYEE"),
        outsider = await person("ADMIN", other),
        spare = await person("EMPLOYEE");
      const team = await p.team.create({
        data: { orgId, name: "Recovery Team", leaderId: lead.id },
      });
      await p.user.updateMany({
        where: { id: { in: [lead.id, emp.id] } },
        data: { teamId: team.id },
      });
      const login = async (u) =>
        (await req("/auth/login", null, "POST", { email: u.email, password }))
          .session;
      const a = await login(admin),
        l = await login(lead),
        e = await login(emp),
        o = await login(outsider);
      const stage = await p.stage.create({
        data: { orgId, name: "Won", kind: "WON" },
      });
      let contact, deal, task;
      await t.test(
        "records move to bin, disappear everywhere, and restore in dependency order",
        async () => {
          contact = await req(
            "/contacts",
            a,
            "POST",
            { name: "Recover me", assigneeId: emp.id },
            201,
          );
          deal = await req(
            "/deals",
            l,
            "POST",
            {
              title: "Recover deal",
              contactId: contact.id,
              stageId: stage.id,
              value: "42",
            },
            201,
          );
          task = await req(
            "/tasks",
            l,
            "POST",
            { title: "Recover task", dealId: deal.id, assigneeId: emp.id },
            201,
          );
          await req("/contacts/" + contact.id, a, "DELETE", null, 409);
          await req("/deals/" + deal.id, l, "DELETE", null, 409);
          await req("/tasks/" + task.id, e, "DELETE", null, 403);
          await req("/tasks/" + task.id, l, "DELETE", null, 204);
          await req("/deals/" + deal.id, l, "DELETE", null, 204);
          await req("/contacts/" + contact.id, l, "DELETE", null, 204);
          for (const [type, row] of [
            ["contacts", contact],
            ["deals", deal],
            ["tasks", task],
          ]) {
            assert.equal((await req("/" + type, a)).total, 0);
            await req("/" + type + "/" + row.id, a, "GET", null, 404);
            await req(
              "/" + type + "/" + row.id,
              a,
              "PATCH",
              { name: "Hidden", title: "Hidden" },
              404,
            );
            const bin = await req("/recycle-bin?type=" + type, l);
            assert.equal(bin.total, 1);
            assert.equal(bin.items[0].id, row.id);
          }
          assert.deepEqual(await req("/search?q=Recover", a), {
            contacts: [],
            deals: [],
            tasks: [],
          });
          const d = await req("/dashboard", a);
          assert.equal(d.kpis.contacts, 0);
          assert.equal(Number(d.kpis.wonThisMonth), 0);
          assert.equal(d.kpis.pendingTasks, 0);
          const perf = await req("/performance", a);
          const employee = perf.employees.find((m) => m.id === emp.id);
          assert.equal(employee.contacts, 0);
          assert.equal(employee.deals, 0);
          assert.equal(employee.tasks, 0);
          await req("/stages/" + stage.id, a, "DELETE", null, 409);
          await req(
            "/recycle-bin/tasks/" + task.id + "/restore",
            l,
            "POST",
            null,
            409,
          );
          await req(
            "/recycle-bin/deals/" + deal.id + "/restore",
            l,
            "POST",
            null,
            409,
          );
          await req(
            "/recycle-bin/contacts/" + contact.id + "/restore",
            l,
            "POST",
          );
          await req("/recycle-bin/deals/" + deal.id + "/restore", l, "POST");
          const restored = await req(
            "/recycle-bin/tasks/" + task.id + "/restore",
            l,
            "POST",
          );
          assert.equal(restored.assigneeId, emp.id);
          assert.equal(restored.dealId, deal.id);
          assert.equal(
            Number((await req("/dashboard", a)).kpis.wonThisMonth),
            42,
          );
          assert.equal(
            (await req("/performance", a)).employees.find(
              (m) => m.id === emp.id,
            ).tasks,
            1,
          );
        },
      );
      await t.test(
        "tenant isolation, employee restrictions and current team permissions",
        async () => {
          await req("/activity", l, "GET", null, 403);
          await req("/activity", e, "GET", null, 403);
          await req("/recycle-bin", e, "GET", null, 403);
          await req("/tasks/" + task.id, l, "DELETE", null, 204);
          await req(
            "/recycle-bin/tasks/" + task.id + "/restore",
            e,
            "POST",
            null,
            403,
          );
          await req(
            "/recycle-bin/tasks/" + task.id + "/restore",
            o,
            "POST",
            null,
            404,
          );
          assert.equal((await req("/recycle-bin?type=tasks", o)).total, 0);
          assert.equal((await req("/activity", o)).total, 0);
          await req(
            "/teams/" + team.id + "/members/" + emp.id,
            l,
            "DELETE",
            null,
            204,
          );
          assert.equal((await req("/recycle-bin?type=tasks", l)).total, 0);
          await req(
            "/recycle-bin/tasks/" + task.id + "/restore",
            l,
            "POST",
            null,
            404,
          );
          await req("/recycle-bin/tasks/" + task.id + "/restore", a, "POST");
          await req("/teams/" + team.id + "/members", a, "POST", {
            employeeId: emp.id,
          });
        },
      );
      await t.test(
        "repeated and simultaneous restore create one event and no duplicate records",
        async () => {
          await req("/tasks/" + task.id, a, "DELETE", null, 204);
          const responses = await Promise.all(
            [1, 2].map(() =>
              fetch(base + "/recycle-bin/tasks/" + task.id + "/restore", {
                method: "POST",
                headers: headers(a),
              }),
            ),
          );
          assert.deepEqual(responses.map((r) => r.status).sort(), [200, 404]);
          await req(
            "/recycle-bin/tasks/" + task.id + "/restore",
            a,
            "POST",
            null,
            404,
          );
          assert.equal(await p.task.count({ where: { id: task.id } }), 1);
          assert.equal(
            await p.activity.count({
              where: { entityId: task.id, action: "restored" },
            }),
            3,
          );
        },
      );
      await t.test(
        "history explains role, team and approval changes without secrets",
        async () => {
          await req("/members/" + spare.id, a, "PATCH", { role: "ADMIN" });
          await req("/members/" + spare.id, a, "PATCH", { role: "EMPLOYEE" });
          const request = await req(
            "/teams/" + team.id + "/requests",
            l,
            "POST",
            { employeeId: spare.id },
            201,
          );
          await req("/team-requests/" + request.id, a, "PATCH", {
            status: "APPROVED",
          });
          await req("/member-passwords/" + spare.id, a, "PATCH", {
            password: "NewHistoryPassword!123",
            name: { password: "Never record this" },
          });
          const activities = await p.activity.findMany({
            where: { orgId },
            orderBy: { createdAt: "asc" },
          });
          const role = activities.find(
            (v) => v.entityId === spare.id && v.details.role === "ADMIN",
          );
          assert.equal(role.details.previous.role, "EMPLOYEE");
          assert.equal(role.actorId, admin.id);
          const approval = activities.find(
            (v) => v.action === "request_approved",
          );
          assert.equal(approval.details.references[spare.id], spare.name);
          assert.equal(approval.details.references[team.id], team.name);
          const filtered = await req(
            "/activity?q=Moved%20to%20recycle%20bin",
            a,
          );
          assert.ok(filtered.total > 0);
          assert.ok(
            filtered.items.every((event) => event.action === "recycled"),
          );
          const serialized = JSON.stringify(activities);
          for (const secret of [
            password,
            "NewHistoryPassword!123",
            "Never record this",
            hash,
            a.cookie,
            a.csrfToken,
          ])
            assert.equal(serialized.includes(secret), false);
          assert.deepEqual(
            activities.find((v) => v.action === "password_changed").details,
            {},
          );
          assert.equal(
            activities.some((v) => v.action === "recycled"),
            true,
          );
          assert.equal(
            activities.some((v) => v.action === "restored"),
            true,
          );
        },
      );
      await t.test(
        "failed writes and failed history insertion leave no partial changes",
        async () => {
          const count = await p.activity.count({ where: { orgId } });
          await req("/contacts/" + contact.id, a, "DELETE", null, 409);
          assert.equal(await p.activity.count({ where: { orgId } }), count);
          // Temporary failure trigger exists ONLY in this disposable test database.
          await p.$executeRawUnsafe(
            `CREATE FUNCTION test_history_reject() RETURNS trigger AS $$ BEGIN IF NEW."entityLabel" = 'Audit rollback fixture' THEN RAISE EXCEPTION 'Simulated audit failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`,
          );
          await p.$executeRawUnsafe(
            'CREATE TRIGGER test_history_reject BEFORE INSERT ON "Activity" FOR EACH ROW EXECUTE FUNCTION test_history_reject()',
          );
          try {
            await req(
              "/contacts",
              a,
              "POST",
              { name: "Audit rollback fixture" },
              500,
            );
          } finally {
            await p.$executeRawUnsafe(
              'DROP TRIGGER test_history_reject ON "Activity"',
            );
            await p.$executeRawUnsafe("DROP FUNCTION test_history_reject()");
          }
          assert.equal(
            await p.contact.count({
              where: { orgId, name: "Audit rollback fixture" },
            }),
            0,
          );
          assert.equal(await p.activity.count({ where: { orgId } }), count);
        },
      );
      await t.test(
        "pagination, date and type filters are scoped and stable",
        async () => {
          await p.activity.createMany({
            data: Array.from({ length: 55 }, (_, i) => ({
              orgId,
              actorId: admin.id,
              actorName: admin.name,
              entityType: "contact",
              entityLabel: "Pagination " + i,
              action: "updated",
              details: {},
              createdAt: new Date("2020-01-01T12:00:00Z"),
            })),
          });
          const first = await req(
            "/activity?type=contact&from=2020-01-01&to=2020-01-01&q=Pagination",
            a,
          );
          const second = await req(
            "/activity?type=contact&from=2020-01-01&to=2020-01-01&q=Pagination&page=2",
            a,
          );
          assert.equal(first.total, 55);
          assert.equal(first.items.length, 50);
          assert.equal(second.items.length, 5);
          assert.equal(
            new Set([...first.items, ...second.items].map((i) => i.id)).size,
            55,
          );
          await req("/activity?from=invalid", a, "GET", null, 400);
          await req("/recycle-bin?type=users", a, "GET", null, 400);
          await req("/activity/" + first.items[0].id, a, "DELETE", null, 404);
        },
      );
      await t.test(
        "admin can recover tasks whose historic assignee no longer has linked access",
        async () => {
          await req("/tasks/" + task.id, a, "DELETE", null, 204);
          await req("/contacts/" + contact.id, a, "PATCH", {
            name: contact.name,
            assigneeId: spare.id,
          });
          await req("/recycle-bin/tasks/" + task.id + "/restore", a, "POST");
          await req("/tasks/" + task.id, e, "GET", null, 404);
          await req("/tasks/" + task.id, a, "PATCH", { assigneeId: spare.id });
          assert.equal(
            (await req("/tasks/" + task.id, a)).assigneeId,
            spare.id,
          );
        },
      );
    } finally {
      const where = { orgId: { in: [orgId, other] } };
      for (const model of [
        "activity",
        "task",
        "deal",
        "contact",
        "teamRequest",
        "user",
        "team",
        "stage",
      ])
        await p[model].deleteMany({ where });
      await p.organisation.deleteMany({
        where: { id: { in: [orgId, other] } },
      });
      await p.$disconnect();
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
  },
);
