// Failed credentials are limited per account/IP, with a wider IP safety net.
// Successful logins must not exhaust a shared office/localhost quota.
function createLoginLimit({ now = Date.now, windowMs = 15 * 60 * 1000, accountMax = 10, ipMax = 100 } = {}) {
  const attempts = new Map();
  function entry(key) {
    const value = attempts.get(key);
    if (value && value.until > now()) return value;
    attempts.delete(key);
    return null;
  }
  function add(key) {
    const value = entry(key) || { count: 0, until: now() + windowMs };
    value.count++;
    attempts.set(key, value);
  }
  return (req, res, next) => {
    // Bound stale entries without keeping timers alive in tests or servers.
    for (const [key, value] of attempts) if (value.until <= now()) attempts.delete(key);
    const ip = req.ip || "unknown";
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 254) : "";
    const ipKey = "ip:" + ip, accountKey = JSON.stringify([ip, email]);
    const blocked = [entry(accountKey), entry(ipKey)].filter((v, i) => v && v.count >= (i === 0 ? accountMax : ipMax));
    if (blocked.length) {
      const seconds = Math.max(1, Math.ceil((Math.max(...blocked.map(v => v.until)) - now()) / 1000));
      res.set("Retry-After", String(seconds));
      return res.status(429).json({ error: `Too many unsuccessful sign-in attempts. Try again in ${Math.ceil(seconds / 60)} minute(s).`, retryAfter: seconds });
    }
    res.once("finish", () => {
      if (res.statusCode === 401 || res.statusCode === 400 || res.statusCode === 403) {
        add(accountKey); add(ipKey);
      } else if (res.statusCode >= 200 && res.statusCode < 300) attempts.delete(accountKey);
    });
    next();
  };
}
module.exports = { createLoginLimit };
