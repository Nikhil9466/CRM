const { PrismaClient } = require("@prisma/client");

// Share one client so we don’t keep opening DB connections.
const prisma = new PrismaClient();

module.exports = prisma;
