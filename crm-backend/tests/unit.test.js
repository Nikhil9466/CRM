const test = require("node:test");
const assert = require("node:assert/strict");
const { text, money, date, account, choice } = require("../src/utils/input");
test("text rejects malformed objects, blank strings and excessive lengths", () => {
  for (const value of [{}, [], 9, "", "   ", "x".repeat(161)]) assert.throws(() => text(value, "Name"));
  assert.equal(text(" Ada ", "Name"), "Ada");
  assert.equal(text("", "Email", 100, true), null);
});
test("money keeps exact cents and rejects negatives, exponent notation and overflow", () => {
  assert.equal(money("1234.50"), "1234.50");
  assert.equal(money(0), "0");
  for (const value of ["-1", "1e4", "12.999", "1000000000000", "", {}, null]) assert.throws(() => money(value));
});
test("dates reject rollover and invalid formatting", () => {
  assert.equal(date("2024-02-29", "Date").toISOString(), "2024-02-29T00:00:00.000Z");
  assert.equal(date("", "Date"), null);
  for (const value of ["2025-02-29", "2026-04-31", "2026-13-01", "22/09/2026", {}]) assert.throws(() => date(value, "Date"));
});
test("account validates names, email, phone and bcrypt password byte limit", () => {
  const good = { name: "Ada", email: "ADA@example.com", phone: "9000000001", password: "TwelveChars!123" };
  assert.equal(account(good).email, "ada@example.com");
  for (const fields of [{ password: "short" }, { password: "é".repeat(37) }, { phone: "123" }, { email: {} }, { name: [] }])
    assert.throws(() => account({ ...good, ...fields }));
});
test("role allowlist does not accept arbitrary privileges", () => {
  assert.equal(choice("ADMIN", ["ADMIN", "USER"], "role"), "ADMIN");
  assert.throws(() => choice("OWNER", ["ADMIN", "USER"], "role"));
});
