-- CreateEnum
CREATE TYPE "RecurringInterval" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "RecurringStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "isRecurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nextOccurrenceAt" TIMESTAMP(3),
ADD COLUMN     "parentTransactionId" TEXT,
ADD COLUMN     "recurringAmount" DECIMAL(18,4),
ADD COLUMN     "recurringEndDate" TIMESTAMP(3),
ADD COLUMN     "recurringFromAccountId" TEXT,
ADD COLUMN     "recurringInterval" "RecurringInterval",
ADD COLUMN     "recurringStatus" "RecurringStatus",
ADD COLUMN     "recurringToAccountId" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_isRecurring_recurringStatus_nextOccurrenceAt_idx" ON "Transaction"("isRecurring", "recurringStatus", "nextOccurrenceAt");

-- CreateIndex
CREATE INDEX "Transaction_parentTransactionId_idx" ON "Transaction"("parentTransactionId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_recurringFromAccountId_fkey" FOREIGN KEY ("recurringFromAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_recurringToAccountId_fkey" FOREIGN KEY ("recurringToAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_parentTransactionId_fkey" FOREIGN KEY ("parentTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
