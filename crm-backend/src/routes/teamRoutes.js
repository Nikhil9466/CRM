const router = require("express").Router();
const { db: prisma, wrap } = require("../utils/changes");
const { Prisma } = require("@prisma/client");
const { admin, manager, publicSelect } = require("../middleware/auth");
const { fail, text, choice } = require("../utils/input");
const { memberScope, recordScope } = require("../utils/access");
const org = (req) => ({ orgId: req.user.orgId });
// Serialize membership and approval changes, and recheck the actor after the lock.
async function change(req, fn) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe(
      'SELECT "id" FROM "Organisation" WHERE "id" = $1 FOR UPDATE',
      req.user.orgId,
    );
    const actor = await tx.user.findFirst({
      where: { id: req.user.id, ...org(req), active: true },
    });
    if (!actor || !["ADMIN", "SUB_ADMIN"].includes(actor.role))
      fail("Team management permission required.", 403);
    return fn(tx, actor);
  });
}
function requireAdmin(actor) {
  if (actor.role !== "ADMIN") fail("Administrator permission required.", 403);
}
async function teamFor(tx, actor, id) {
  const team = await tx.team.findFirst({ where: { id, orgId: actor.orgId } });
  if (!team) fail("Team not found.", 404);
  if (
    actor.role !== "ADMIN" &&
    (actor.teamId !== id || team.leaderId !== actor.id)
  )
    fail("You can manage only your own team.", 403);
  return team;
}
async function employeeFor(tx, actor, id) {
  const employee = await tx.user.findFirst({
    where: { id, orgId: actor.orgId, active: true, role: "EMPLOYEE" },
  });
  if (!employee) fail("Choose an active employee in this organisation.", 400);
  return employee;
}
router.get(
  "/teams",
  manager,
  wrap(async (req, res) => {
    res.json(
      await prisma.team.findMany({
        where: {
          ...org(req),
          ...(req.user.role === "ADMIN" ? {} : { id: req.user.teamId || "" }),
        },
        orderBy: { name: "asc" },
      }),
    );
  }),
);
router.post(
  "/teams",
  admin,
  wrap(async (req, res) => {
    res.status(201).json(
      await change(req, async (tx, actor) => {
        requireAdmin(actor);
        const name = text(req.body.name, "Team name", 80);
        const leaderId = text(req.body.leaderId, "Team leader", 100);
        const leader = await tx.user.findFirst({
          where: {
            id: leaderId,
            ...org(req),
            active: true,
            role: { in: ["EMPLOYEE", "SUB_ADMIN"] },
          },
        });
        if (!leader || leader.teamId)
          fail("Choose an active employee or sub-admin who is not in a team.");
        const team = await tx.team.create({
          data: { ...org(req), name, leaderId },
        });
        await tx.user.update({
          where: { id: leaderId },
          data: { role: "SUB_ADMIN", teamId: team.id },
        });
        return team;
      }),
    );
  }),
);
router.patch(
  "/teams/:id",
  admin,
  wrap(async (req, res) => {
    res.json(
      await change(req, async (tx, actor) => {
        requireAdmin(actor);
        const team = await teamFor(tx, actor, req.params.id);
        const data = {};
        if (req.body.name !== undefined)
          data.name = text(req.body.name, "Team name", 80);
        if (
          req.body.leaderId !== undefined &&
          req.body.leaderId !== team.leaderId
        ) {
          const leaderId = text(req.body.leaderId, "Team leader", 100);
          const leader = await tx.user.findFirst({
            where: {
              id: leaderId,
              ...org(req),
              active: true,
              role: { in: ["EMPLOYEE", "SUB_ADMIN"] },
            },
          });
          if (!leader || (leader.teamId && leader.teamId !== team.id))
            fail(
              "Choose an active employee or sub-admin from this team or without a team.",
            );
          if (team.leaderId)
            await tx.user.update({
              where: { id: team.leaderId },
              data: { role: "EMPLOYEE" },
            });
          await tx.user.update({
            where: { id: leaderId },
            data: { role: "SUB_ADMIN", teamId: team.id },
          });
          data.leaderId = leaderId;
        }
        return tx.team.update({ where: { id: team.id }, data });
      }),
    );
  }),
);
router.get(
  "/team-candidates",
  manager,
  wrap(async (req, res) => {
    // Only directory information needed to request an employee; no other team's work.
    res.json(
      await prisma.user.findMany({
        where: {
          ...org(req),
          active: true,
          role: "EMPLOYEE",
          ...(req.user.teamId
            ? { OR: [{ teamId: null }, { teamId: { not: req.user.teamId } }] }
            : {}),
        },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      }),
    );
  }),
);
router.post(
  "/teams/:id/members",
  admin,
  wrap(async (req, res) => {
    res.json(
      await change(req, async (tx, actor) => {
        requireAdmin(actor);
        const team = await teamFor(tx, actor, req.params.id);
        const employee = await employeeFor(
          tx,
          actor,
          text(req.body.employeeId, "Employee", 100),
        );
        return tx.user.update({
          where: { id: employee.id },
          data: { teamId: team.id },
          select: publicSelect,
        });
      }),
    );
  }),
);
router.delete(
  "/teams/:id/members/:employeeId",
  manager,
  wrap(async (req, res) => {
    await change(req, async (tx, actor) => {
      const team = await teamFor(tx, actor, req.params.id);
      const employee = await tx.user.findFirst({
        where: {
          id: req.params.employeeId,
          ...org(req),
          teamId: team.id,
          role: "EMPLOYEE",
        },
      });
      if (!employee) fail("Employee not found in this team.", 404);
      await tx.user.update({
        where: { id: employee.id },
        data: { teamId: null },
      });
    });
    res.status(204).end();
  }),
);
router.get(
  "/team-requests",
  manager,
  wrap(async (req, res) => {
    const requests = await prisma.teamRequest.findMany({
      where: {
        ...org(req),
        ...(req.user.role === "ADMIN" ? {} : { teamId: req.user.teamId || "" }),
      },
      include: { team: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    const people = await prisma.user.findMany({
      where: {
        ...org(req),
        id: {
          in: [
            ...new Set(requests.flatMap((r) => [r.employeeId, r.requestedBy])),
          ],
        },
      },
      select: { id: true, name: true },
    });
    res.json(
      requests.map((r) => ({
        ...r,
        employeeName:
          people.find((p) => p.id === r.employeeId)?.name ||
          "Unavailable employee",
        requesterName:
          people.find((p) => p.id === r.requestedBy)?.name ||
          "Unavailable account",
      })),
    );
  }),
);
router.post(
  "/teams/:id/requests",
  manager,
  wrap(async (req, res) => {
    res.status(201).json(
      await change(req, async (tx, actor) => {
        const team = await teamFor(tx, actor, req.params.id);
        const employee = await employeeFor(
          tx,
          actor,
          text(req.body.employeeId, "Employee", 100),
        );
        if (employee.teamId === team.id)
          fail("This employee is already in the team.", 409);
        if (
          await tx.teamRequest.findFirst({
            where: {
              teamId: team.id,
              employeeId: employee.id,
              status: "PENDING",
            },
          })
        )
          fail("An approval request is already pending.", 409);
        return tx.teamRequest.create({
          data: {
            ...org(req),
            teamId: team.id,
            employeeId: employee.id,
            requestedBy: actor.id,
          },
        });
      }),
    );
  }),
);
router.patch(
  "/team-requests/:id",
  admin,
  wrap(async (req, res) => {
    res.json(
      await change(req, async (tx, actor) => {
        requireAdmin(actor);
        const status = choice(
          req.body.status,
          ["APPROVED", "REJECTED"],
          "review decision",
        );
        const request = await tx.teamRequest.findFirst({
          where: { id: req.params.id, ...org(req) },
        });
        if (!request) fail("Request not found.", 404);
        if (request.status !== "PENDING")
          fail("This request has already been reviewed.", 409);
        if (status === "APPROVED") {
          const employee = await employeeFor(tx, actor, request.employeeId);
          const team = await teamFor(tx, actor, request.teamId);
          if (
            team.leaderId !== request.requestedBy &&
            request.requestedBy !== actor.id
          )
            fail(
              "The requesting leader has changed. Reject this request and ask the new leader to submit it again.",
              409,
            );
          await tx.user.update({
            where: { id: employee.id },
            data: { teamId: team.id },
          });
          await tx.teamRequest.updateMany({
            where: {
              employeeId: employee.id,
              ...org(req),
              status: "PENDING",
              id: { not: request.id },
            },
            data: {
              status: "REJECTED",
              reviewedBy: actor.id,
              reviewedAt: new Date(),
            },
          });
        }
        return tx.teamRequest.update({
          where: { id: request.id },
          data: { status, reviewedBy: actor.id, reviewedAt: new Date() },
        });
      }),
    );
  }),
);
router.get(
  "/performance",
  manager,
  wrap(async (req, res) => {
    const result = await prisma.$transaction(
      async (tx) => {
        const members = await tx.user.findMany({
          where: memberScope(req.user),
          select: publicSelect,
          orderBy: { name: "asc" },
        });
        const ids = members.map((m) => m.id);
        const [teams, contacts, deals, tasks] = await Promise.all([
          tx.team.findMany({
            where: {
              ...org(req),
              ...(req.user.role === "ADMIN"
                ? {}
                : { id: req.user.teamId || "" }),
            },
            orderBy: { name: "asc" },
          }),
          tx.contact.groupBy({
            by: ["assigneeId"],
            where: {
              ...recordScope(req.user, "contact"),
              assigneeId: { in: ids },
            },
            _count: { _all: true },
          }),
          tx.deal.findMany({
            where: {
              ...recordScope(req.user, "deal"),
              contact: { assigneeId: { in: ids }, deletedAt: null },
            },
            select: {
              value: true,
              contact: { select: { assigneeId: true } },
              stage: { select: { kind: true } },
            },
          }),
          tx.task.groupBy({
            by: ["assigneeId", "completed"],
            where: {
              ...recordScope(req.user, "task"),
              assigneeId: { in: ids },
            },
            _count: { _all: true },
          }),
        ]);
        const employees = members.map((m) => {
          const owned = deals.filter((d) => d.contact.assigneeId === m.id);
          const won = owned.filter((d) => d.stage.kind === "WON");
          return {
            ...m,
            contacts:
              contacts.find((c) => c.assigneeId === m.id)?._count._all || 0,
            deals: owned.length,
            won: won.length,
            revenue: won
              .reduce((n, d) => n.plus(d.value), new Prisma.Decimal(0))
              .toString(),
            tasks: tasks
              .filter((t) => t.assigneeId === m.id)
              .reduce((n, t) => n + t._count._all, 0),
            completed:
              tasks.find((t) => t.assigneeId === m.id && t.completed)?._count
                ._all || 0,
          };
        });
        return {
          employees,
          teams: teams.map((team) => {
            const people = employees.filter((m) => m.teamId === team.id);
            return {
              ...team,
              members: people.length,
              ...Object.fromEntries(
                ["contacts", "deals", "won", "tasks", "completed"].map((k) => [
                  k,
                  people.reduce((n, m) => n + m[k], 0),
                ]),
              ),
              revenue: people
                .reduce((n, m) => n.plus(m.revenue), new Prisma.Decimal(0))
                .toString(),
            };
          }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    res.json(result);
  }),
);
module.exports = router;
