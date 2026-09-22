const { PrismaClient } = require("@prisma/client");

// Reuse a single Prisma client across the app instead of creating a new
// connection pool on every import.
const prisma = new PrismaClient();

module.exports = prisma;
