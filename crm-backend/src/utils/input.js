const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
function text(value, label, max = 160, optional = false) {
  if (optional && (value === undefined || value === null || value === "")) return null;
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    fail(label + " is required and must be at most " + max + " characters.");
  return value.trim();
}
function date(value, label) {
  if (value === null || value === "" || value === undefined) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    fail(label + " must be YYYY-MM-DD.");
  const parsed = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    fail(label + " is invalid.");
  return parsed;
}
function money(value) {
  const s = String(value ?? "");
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(s))
    fail("Value must be a non-negative amount with at most two decimal places.");
  return s;
}
function choice(value, values, label) {
  if (!values.includes(value)) fail("Invalid " + label + ".");
  return value;
}
function account(body) {
  const name = text(body.name, "Name", 20);
  const email = text(body.email, "Email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Enter a valid email.");
  const phone = text(body.phone, "Phone", 10);
  if (!/^\d{10}$/.test(phone)) fail("Phone must contain exactly 10 digits.");
  const password = body.password;
  if (typeof password !== "string" || password.length < 12 || Buffer.byteLength(password) > 72)
    fail("Password must be at least 12 characters and at most 72 UTF-8 bytes.");
  return { name, email, phone, password };
}
module.exports = { fail, text, date, money, choice, account };
