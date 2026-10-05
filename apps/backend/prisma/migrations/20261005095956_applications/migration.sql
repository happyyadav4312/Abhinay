-- Forward migration for WBS 1.2.2.2 Apply to a casting role.
--
-- Purely additive: a new enum, a new table and its indexes. The unique pair
-- (casting_role_id, applicant_id) is what makes a second application to the
-- same role impossible, including under concurrent requests.

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('APPLIED', 'SHORTLISTED', 'SELECTED', 'REJECTED');

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "casting_role_id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "applications_applicant_id_created_at_idx" ON "applications"("applicant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "applications_casting_role_id_applicant_id_key" ON "applications"("casting_role_id", "applicant_id");

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_casting_role_id_fkey" FOREIGN KEY ("casting_role_id") REFERENCES "casting_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
