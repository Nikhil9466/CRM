const router = require("express").Router();
const { signup, login } = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");
const { destroySession } = require("../utils/sessions");
router.get("/session", authenticate, (req, res) =>
  res.json({ user: req.user, csrfToken: req.session.csrfToken }),
);
router.post("/logout", authenticate, async (req, res, next) => {
  try {
    await destroySession(req, res);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
const attempts = new Map();
const timer = setInterval(() => {
  for (const [key, value] of attempts)
    if (value.until < Date.now()) attempts.delete(key);
}, 60000);
timer.unref();
const signupLimit = (req, res, next) => {
  const now = Date.now();
  let entry = attempts.get(req.ip);
  if (!entry || entry.until < now) {
    entry = { count: 0, until: now + 15 * 60000 };
    attempts.set(req.ip, entry);
  }
  if (++entry.count > 60)
    return res
      .status(429)
      .json({ error: "Too many attempts. Try again in 15 minutes." });
  next();
};
router.post("/signup", signupLimit, signup);
router.post(
  "/login",
  require("../middleware/loginLimit").createLoginLimit(),
  login,
);
router.post("/reset-password", (req, res) =>
  res.status(410).json({
    error: "Password recovery is not enabled. Contact the server operator.",
  }),
);
module.exports = router;
