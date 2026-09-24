exports.headers = (session) => ({
  "Content-Type": "application/json",
  "X-CRM-Request": "1",
  ...(session
    ? { Cookie: session.cookie, "X-CSRF-Token": session.csrfToken }
    : {}),
});
exports.attachSession = (data, res) => {
  const cookie = res.headers.get("set-cookie");
  if (cookie && data?.csrfToken)
    data.session = { cookie: cookie.split(";")[0], csrfToken: data.csrfToken };
  return data;
};
