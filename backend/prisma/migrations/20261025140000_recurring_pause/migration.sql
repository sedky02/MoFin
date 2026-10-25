-- A recurring series can be paused, by the user or by the cron when an
-- occurrence can't be posted (the reason is kept for the user to see).

-- AlterEnum
-- BEFORE keeps the enum's sort order ACTIVE, PAUSED, CANCELLED, which the
-- Recurring view's "next occurrence" sort relies on.
ALTER TYPE "RecurringStatus" ADD VALUE 'PAUSED' BEFORE 'CANCELLED';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "lastFailedAt" TIMESTAMP(3),
ADD COLUMN "recurringError" TEXT;
