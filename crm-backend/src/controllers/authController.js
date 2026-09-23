const bcrypt = require("bcrypt");
const prisma = require("../config/prisma");
const { signToken } = require("../utils/jwt");
const { publicSelect } = require("../middleware/auth");
const { account, text, fail } = require("../utils/input");
const stages = require("../utils/stages");

async function signup(req, res, next) {
  try {
    const { password, ...fields } = account(req.body);
    const orgId = text(req.body.orgId, "Organisation ID", 80);
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.$transaction(async (tx) => {
      if (await tx.organisation.findUnique({ where: { id: orgId } }))
        fail(
          "This organisation already exists. Ask its administrator to create your account.",
          409,
        );
      await tx.organisation.create({ data: { id: orgId } });
      await tx.stage.createMany({ data: stages(orgId) });
      return tx.user.create({
        data: { ...fields, orgId, passwordHash, role: "ADMIN" },
        select: publicSelect,
      });
    });
    res.status(201).json({ user, token: signToken({ userId: user.id }) });
  } catch (err) {
    next(err);
  }
}
async function login(req, res, next) {
  try {
    const email = text(req.body.email, "Email", 254).toLowerCase();
    if (
      typeof req.body.password !== "string" ||
      !req.body.password ||
      req.body.password.length > 1000
    )
      fail("Password is required.");
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(req.body.password, user.passwordHash)))
      return res.status(401).json({ error: "Invalid email or password." });
    if (!user.active)
      return res.status(403).json({ error: "This account is deactivated. Ask your administrator to activate it in Team & settings." });
    const safe = Object.fromEntries(Object.keys(publicSelect).map((key) => [key, user[key]]));
    res.json({ user: safe, token: signToken({ userId: user.id, version: user.sessionVersion }) });
  } catch (err) {
    next(err);
  }
}
module.exports = { signup, login };
