const bcrypt = require("bcrypt");
const prisma = require("../config/prisma");
const { signToken } = require("../utils/jwt");

const SALT_ROUNDS = 12;

function publicUser(user) {
  // Never send the password hash back to the client.
  const { passwordHash, ...safe } = user;
  return safe;
}

async function signup(req, res) {
  try {
    const { name, email, password, phone, orgId } = req.body;

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] },
    });
    if (existing) {
      const field = existing.email === email ? "email" : "phone";
      return res.status(409).json({
        errors: { [field]: `An account with this ${field} already exists.` },
      });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const user = await prisma.user.create({
      data: { name, email, passwordHash, phone, orgId, photoUrl },
    });

    const token = signToken({ userId: user.id });

    res.status(201).json({ user: publicUser(user), token });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Something went wrong creating your account." });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
  

    const user = await prisma.user.findUnique({ where: { email } });
    console.log(user)
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = signToken({ userId: user.id });

    res.status(200).json({ user: publicUser(user), token });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Something went wrong logging you in." });
  }
}

module.exports = { signup, login };
