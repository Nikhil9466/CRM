-- Preserve existing users by renaming the role in place.
ALTER TYPE "Role" RENAME VALUE 'USER' TO 'EMPLOYEE';
ALTER TYPE "Role" ADD VALUE 'SUB_ADMIN';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "teamId" TEXT,
ALTER COLUMN "role" SET DEFAULT 'EMPLOYEE';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "assigneeId" TEXT;

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "leaderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamRequest" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Team_leaderId_key" ON "Team"("leaderId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_orgId_name_key" ON "Team"("orgId", "name");

-- CreateIndex
CREATE INDEX "TeamRequest_orgId_status_idx" ON "TeamRequest"("orgId", "status");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamRequest" ADD CONSTRAINT "TeamRequest_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Keep existing linked tasks with their contact owner. Standalone legacy tasks
-- remain visible to admins until explicitly assigned.
UPDATE "Task" t SET "assigneeId" = c."assigneeId" FROM "Contact" c
WHERE t."contactId" = c.id AND t."orgId" = c."orgId";
UPDATE "Task" t SET "assigneeId" = c."assigneeId" FROM "Deal" d JOIN "Contact" c ON c.id = d."contactId"
WHERE t."dealId" = d.id AND t."orgId" = d."orgId";
