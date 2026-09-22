require("dotenv").config();
const prisma = require("../src/config/prisma");
const email = process.argv[2];
async function main() {
  if (!email) throw new Error("Usage: npm run admin:promote -- exact-account-email");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("No account matches that exact email.");
  await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN", active: true } });
  console.log("Administrator enabled for " + user.email + " in " + user.orgId);
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
