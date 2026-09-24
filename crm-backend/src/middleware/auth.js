const prisma = require("../config/prisma");
const { readSessionId, digest, equalToken } = require("../utils/sessions");
const { safeMethods } = require("./csrf");
const publicSelect = {
  id: true,
  name: true,
  email: true,
  orgId: true,
  role: true,
  active: true,
  teamId: true,
};
async function authenticate(req, res, next) {
  try {
    const id = readSessionId(req);
    const session = id
      ? await prisma.session.findUnique({
          where: { idHash: digest(id) },
          include: {
            user: { select: { ...publicSelect, sessionVersion: true } },
          },
        })
      : null;
    if (!session || session.expiresAt <= new Date())
      return res
        .status(401)
        .json({ error: "Your session has expired. Please log in." });
    if (!session.user.active)
      return res
        .status(401)
        .json({
          error: "Account unavailable. Please contact your administrator.",
        });
    if (session.sessionVersion !== session.user.sessionVersion)
      return res.status(401).json({ error: "Please log in again." });
    const supplied = req.get("X-CSRF-Token");
    // A token mismatch on reads also catches another tab switching accounts,
    // so an old page never renders or writes under the new account silently.
    if (
      (supplied || !safeMethods.has(req.method)) &&
      !equalToken(supplied, session.csrfToken)
    )
      return res
        .status(403)
        .json({
          code: "SESSION_CHANGED",
          error:
            "Your session changed in another tab. Refresh before continuing.",
        });
    req.session = { idHash: session.idHash, csrfToken: session.csrfToken };
    req.user = session.user;
    delete req.user.sessionVersion;
    next();
  } catch (err) {
    next(err);
  }
}

function admin(req, res, next) {
  if (req.user.role !== "ADMIN")
    return res
      .status(403)
      .json({ error: "Administrator permission required." });
  next();
}
function manager(req, res, next) {
  if (!["ADMIN", "SUB_ADMIN"].includes(req.user.role))
    return res.status(403).json({ error: "Team leader permission required." });
  next();
}
module.exports = { authenticate, admin, manager, publicSelect };
