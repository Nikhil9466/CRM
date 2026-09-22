const prisma = require("../config/prisma");
const { verifyToken } = require("../utils/jwt");
const publicSelect = { id: true, name: true, email: true, orgId: true, role: true, active: true };
async function authenticate(req, res, next) {
  let claims;
  try {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) throw new Error();
    claims = verifyToken(header.slice(7));
    if (typeof claims.userId !== "string") throw new Error();
  } catch { return res.status(401).json({ error: "Your session has expired. Please log in." }); }
  try {
    req.user = await prisma.user.findUnique({ where: { id: claims.userId }, select: { ...publicSelect, sessionVersion: true } });
    if (!req.user?.active) return res.status(401).json({ error: "Account unavailable. Please contact your administrator." });
    if ((claims.version || 0) !== req.user.sessionVersion) return res.status(401).json({ error: "Please log in again." });
    delete req.user.sessionVersion;
    next();
  } catch (err) { next(err); }
}
function admin(req, res, next) {
  if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Administrator permission required." });
  next();
}
module.exports = { authenticate, admin, publicSelect };
