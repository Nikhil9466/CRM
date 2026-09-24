const { randomBytes, createHash, timingSafeEqual } = require("node:crypto");
const prisma = require("../config/prisma");
const lifetime = 7 * 24 * 60 * 60 * 1000;
function secureCookies() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.APP_ORIGIN?.startsWith("https://")
  );
}
function cookieName() {
  return secureCookies() ? "__Host-crm_session" : "crm_session";
}
function cookieOptions() {
  return {
    httpOnly: true,
    secure: Boolean(secureCookies()),
    sameSite: "lax",
    path: "/",
  };
}
function readSessionId(req) {
  const values = (req.headers.cookie || "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.startsWith(cookieName() + "="));
  if (values.length !== 1) return null;
  const value = values[0].slice(cookieName().length + 1);
  return /^[a-f0-9]{64}$/.test(value) ? value : null;
}
function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
function equalToken(a, b) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    /^[a-f0-9]{64}$/.test(a) &&
    /^[a-f0-9]{64}$/.test(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
async function createSession(req, res, user, remember) {
  const id = randomBytes(32).toString("hex");
  const csrfToken = randomBytes(32).toString("hex");
  const previous = readSessionId(req);
  await prisma.$transaction(async (tx) => {
    // Replace the browser's old session only after successful authentication.
    if (previous)
      await tx.session.deleteMany({ where: { idHash: digest(previous) } });
    await tx.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    await tx.session.create({
      data: {
        idHash: digest(id),
        userId: user.id,
        sessionVersion: user.sessionVersion || 0,
        csrfToken,
        expiresAt: new Date(Date.now() + lifetime),
      },
    });
  });
  res.cookie(cookieName(), id, {
    ...cookieOptions(),
    ...(remember ? { maxAge: lifetime } : {}),
  });
  return csrfToken;
}
async function destroySession(req, res) {
  await prisma.session.deleteMany({ where: { idHash: req.session.idHash } });
  res.clearCookie(cookieName(), cookieOptions());
}
module.exports = {
  createSession,
  destroySession,
  readSessionId,
  digest,
  equalToken,
  cookieName,
  cookieOptions,
  lifetime,
};
