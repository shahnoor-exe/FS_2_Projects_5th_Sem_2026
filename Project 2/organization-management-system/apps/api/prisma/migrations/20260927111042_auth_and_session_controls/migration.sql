/*
  Warnings:

  - The required column `family_id` was added to the `refresh_tokens` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "organization_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "family_id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
ADD COLUMN     "replaced_by_token_id" TEXT,
ADD COLUMN     "revocation_reason" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "platform_role" TEXT NOT NULL DEFAULT 'USER';

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");
