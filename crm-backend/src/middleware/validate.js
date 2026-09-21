// Same rules as the frontend's validateX() functions in signup.html/login.html —
// kept here too because client-side validation can always be bypassed.

const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
const PHONE_PATTERN = /^\d{10}$/;
const SPECIAL_CHAR_PATTERN = /(?=.*[!@#$%^&*(),.?":{}|<>])/;

function validateSignup(req, res, next) {
  const { name, email, password, phone, orgId } = req.body;
  const errors = {};

  if (!name || !name.trim()) errors.name = "Name is required.";
  else if (name.length > 20) errors.name = "Name must be 20 characters or fewer.";

  if (!email || !email.trim()) errors.email = "Email is required.";
  else if (!EMAIL_PATTERN.test(email))
    errors.email = "Only @gmail.com addresses are accepted.";

  if (!password) errors.password = "Password is required.";
  else if (password.length < 6 || password.length > 20)
    errors.password = "Password must be 6-20 characters.";
  else if (!SPECIAL_CHAR_PATTERN.test(password))
    errors.password = "Password must include a special character.";

  if (!phone || !phone.trim()) errors.phone = "Phone number is required.";
  else if (!PHONE_PATTERN.test(phone))
    errors.phone = "Enter exactly 10 digits (numbers only).";

  if (!orgId || !orgId.trim()) errors.orgId = "Organisation ID is required.";

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  next();
}

function validateLogin(req, res, next) {
  const { email, password } = req.body;
  const errors = {};

  if (!email || !email.trim()) errors.email = "Email is required.";
  else if (!EMAIL_PATTERN.test(email))
    errors.email = "Only @gmail.com addresses are accepted.";

  if (!password) errors.password = "Password is required.";

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  next();
}

function validateResetPassword(req, res, next) {
  const { email, orgId, password } = req.body;
  const errors = {};

  if (!email || !email.trim()) errors.email = "Email is required.";
  else if (!EMAIL_PATTERN.test(email))
    errors.email = "Only @gmail.com addresses are accepted.";

  if (!orgId || !orgId.trim()) errors.orgId = "Organisation ID is required.";

  if (!password) errors.password = "Password is required.";
  else if (password.length < 6 || password.length > 20)
    errors.password = "Password must be 6-20 characters.";
  else if (!SPECIAL_CHAR_PATTERN.test(password))
    errors.password = "Password must include a special character.";

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }
  next();
}

module.exports = { validateSignup, validateLogin, validateResetPassword };
