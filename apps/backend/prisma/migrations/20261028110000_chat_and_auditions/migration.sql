-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'CHAT_MESSAGE_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'AUDITION_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'AUDITION_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'AUDITION_REVIEWED';

-- CreateEnum
CREATE TYPE "AuditionStatus" AS ENUM ('PENDING', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "chat_conversations" (
    "id" TEXT NOT NULL,
    "casting_role_id" TEXT NOT NULL,
    "participant_a" TEXT NOT NULL,
    "participant_b" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditions" (
    "id" TEXT NOT NULL,
    "casting_role_id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "deadline" DATE,
    "status" "AuditionStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audition_submissions" (
    "id" TEXT NOT NULL,
    "audition_id" TEXT NOT NULL,
    "provider" "StorageProvider" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "bytes" INTEGER NOT NULL,
    "duration_seconds" DOUBLE PRECISION,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audition_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_conversations_participant_a_idx" ON "chat_conversations"("participant_a");
CREATE INDEX "chat_conversations_participant_b_idx" ON "chat_conversations"("participant_b");
CREATE UNIQUE INDEX "chat_conversations_casting_role_id_participant_a_participant_b_key" ON "chat_conversations"("casting_role_id", "participant_a", "participant_b");

-- CreateIndex
CREATE INDEX "chat_messages_conversation_id_created_at_idx" ON "chat_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "auditions_application_id_key" ON "auditions"("application_id");
CREATE INDEX "auditions_casting_role_id_idx" ON "auditions"("casting_role_id");

-- CreateIndex
CREATE INDEX "audition_submissions_audition_id_idx" ON "audition_submissions"("audition_id");

-- AddForeignKey
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_casting_role_id_fkey" FOREIGN KEY ("casting_role_id") REFERENCES "casting_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_participant_a_fkey" FOREIGN KEY ("participant_a") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_participant_b_fkey" FOREIGN KEY ("participant_b") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditions" ADD CONSTRAINT "auditions_casting_role_id_fkey" FOREIGN KEY ("casting_role_id") REFERENCES "casting_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auditions" ADD CONSTRAINT "auditions_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audition_submissions" ADD CONSTRAINT "audition_submissions_audition_id_fkey" FOREIGN KEY ("audition_id") REFERENCES "auditions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
