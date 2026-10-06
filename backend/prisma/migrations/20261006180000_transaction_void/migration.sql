-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "reversesTransactionId" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_reversesTransactionId_key" ON "Transaction"("reversesTransactionId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_reversesTransactionId_fkey" FOREIGN KEY ("reversesTransactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
