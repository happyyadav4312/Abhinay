-- Forward migration for WBS 1.2 Casting Marketplace (1.2.1 role posting,
-- 1.2.2.1 browse & search).
--
-- Purely additive: a new enum, a new table and its indexes. No existing table
-- or column is altered, so it is safe on a populated database. Deleting a user
-- removes their casting roles, matching every other child table.

-- CreateEnum
CREATE TYPE "CastingRoleStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "casting_roles" (
    "id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requirements" TEXT NOT NULL,
    "compensation" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "seeking_role" "Role" NOT NULL,
    "status" "CastingRoleStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "casting_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "casting_roles_created_by_id_idx" ON "casting_roles"("created_by_id");

-- CreateIndex
CREATE INDEX "casting_roles_status_published_at_idx" ON "casting_roles"("status", "published_at");

-- CreateIndex
CREATE INDEX "casting_roles_status_seeking_role_idx" ON "casting_roles"("status", "seeking_role");

-- AddForeignKey
ALTER TABLE "casting_roles" ADD CONSTRAINT "casting_roles_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
