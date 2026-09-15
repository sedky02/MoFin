-- Prevents a crash between generating a recurring occurrence and advancing
-- the series cursor from ever producing a duplicate occurrence on retry.
CREATE UNIQUE INDEX "Transaction_parentTransactionId_occurredAt_key" ON "Transaction"("parentTransactionId", "occurredAt");
