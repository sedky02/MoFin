-- Accounts can start from an existing balance instead of a fake income entry.
-- Existing accounts get 0, so no balance changes.

-- AlterTable
ALTER TABLE "Account" ADD COLUMN "openingBalance" DECIMAL(18,4) NOT NULL DEFAULT 0;
