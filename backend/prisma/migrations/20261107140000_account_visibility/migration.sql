-- AlterTable
ALTER TABLE "AccountMember" ADD COLUMN     "visibility" TEXT NOT NULL DEFAULT 'visible';

-- The old flag hid the amount and left the account out of "All accounts": that is "private".
UPDATE "AccountMember" SET "visibility" = 'private' WHERE "hideAmount" = true;
UPDATE "Account"
SET "metadata" = ("metadata" - 'hideAmount') || '{"visibility":"private"}'::jsonb
WHERE "metadata"->>'hideAmount' = 'true';

-- AlterTable
ALTER TABLE "AccountMember" DROP COLUMN "hideAmount";
