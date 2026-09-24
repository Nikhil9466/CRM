// Failed credentials are limited per account/IP, with a wider IP safety net.
// Successful logins do not exhaust a shared office/localhost quota.
function createLoginLimit({
  now = Date.now,
  windowMs = 15 * 60 * 1000,
  accountMax = 10,
  ipMax = 100,
} = {}) {
  const attempts = new Map();
  function bucket(key) {
    let value = attempts.get(key);
    if (!value || value.until <= now()) {
      value = { count: 0, inFlight: 0, until: now() + windowMs };
      attempts.set(key, value);
    }
    return value;
  }
  return (req, res, next) => {
    for (const [key, value] of attempts)
      if (value.until <= now()) attempts.delete(key);
    const ip = req.ip || "unknown";
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase().slice(0, 254)
        : "";
    const account = bucket(JSON.stringify([ip, email])),
      address = bucket("ip:" + ip);
    const blocked = [
      [account, accountMax],
      [address, ipMax],
    ].filter(([value, max]) => value.count + value.inFlight >= max);
    if (blocked.length) {
      const seconds = blocked.some(([value, max]) => value.count >= max)
        ? Math.max(
            1,
            Math.ceil(
              (Math.max(...blocked.map(([v]) => v.until)) - now()) / 1000,
            ),
          )
        : 1;
      res.set("Retry-After", String(seconds));
      return res
        .status(429)
        .json({
          error:
            seconds === 1
              ? "Too many sign-ins are in progress. Please retry in a moment."
              : `Too many unsuccessful sign-in attempts. Try again in ${Math.ceil(seconds / 60)} minute(s).`,
          retryAfter: seconds,
        });
    }
    account.inFlight++;
    address.inFlight++;
    let finished = false;
    function settle(aborted = false) {
      if (finished) return;
      finished = true;
      account.inFlight--;
      address.inFlight--;
      if (aborted || [400, 401, 403].includes(res.statusCode)) {
        account.count++;
        address.count++;
      } else if (res.statusCode >= 200 && res.statusCode < 300)
        account.count = 0;
    }
    res.once("finish", () => settle());
    res.once("close", () => settle(true));
    next();
  };
}
module.exports = { createLoginLimit };
