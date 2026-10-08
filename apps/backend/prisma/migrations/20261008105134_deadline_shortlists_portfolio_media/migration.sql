-- CreateEnum
CREATE TYPE "StorageProvider" AS ENUM ('LOCAL', 'CLOUDINARY');

-- CreateEnum
CREATE TYPE "PortfolioMediaKind" AS ENUM ('PHOTO', 'VIDEO');

-- AlterTable
ALTER TABLE "casting_roles" ADD COLUMN     "application_deadline" DATE;

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "profile_image_provider" "StorageProvider",
ADD COLUMN     "profile_image_url" TEXT,
ADD COLUMN     "resume_bytes" INTEGER,
ADD COLUMN     "resume_file_name" TEXT,
ADD COLUMN     "resume_key" TEXT,
ADD COLUMN     "resume_provider" "StorageProvider",
ADD COLUMN     "resume_uploaded_at" TIMESTAMP(3),
ADD COLUMN     "resume_url" TEXT;

-- Backfill: every photo uploaded before this migration lives on the local
-- filesystem. Recording that keeps those photos resolvable and deletable now
-- that new uploads go to Cloudinary. Their URL stays NULL and is rebuilt from
-- the key at read time.
UPDATE "profiles" SET "profile_image_provider" = 'LOCAL' WHERE "profile_image" IS NOT NULL;

-- CreateTable
CREATE TABLE "portfolio_items" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "kind" "PortfolioMediaKind" NOT NULL,
    "provider" "StorageProvider" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "title" TEXT,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration_seconds" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shortlist_folders" (
    "id" TEXT NOT NULL,
    "casting_role_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shortlist_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shortlist_entries" (
    "id" TEXT NOT NULL,
    "folder_id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shortlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portfolio_items_profile_id_kind_created_at_idx" ON "portfolio_items"("profile_id", "kind", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "shortlist_folders_casting_role_id_normalized_name_key" ON "shortlist_folders"("casting_role_id", "normalized_name");

-- CreateIndex
CREATE INDEX "shortlist_entries_application_id_idx" ON "shortlist_entries"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "shortlist_entries_folder_id_application_id_key" ON "shortlist_entries"("folder_id", "application_id");

-- CreateIndex
CREATE INDEX "applications_casting_role_id_created_at_idx" ON "applications"("casting_role_id", "created_at");

-- CreateIndex
CREATE INDEX "casting_roles_status_application_deadline_idx" ON "casting_roles"("status", "application_deadline");

-- AddForeignKey
ALTER TABLE "portfolio_items" ADD CONSTRAINT "portfolio_items_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlist_folders" ADD CONSTRAINT "shortlist_folders_casting_role_id_fkey" FOREIGN KEY ("casting_role_id") REFERENCES "casting_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlist_entries" ADD CONSTRAINT "shortlist_entries_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "shortlist_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlist_entries" ADD CONSTRAINT "shortlist_entries_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
