-- CreateIndex
CREATE INDEX "AnalyticsCache_expiresAt_idx" ON "AnalyticsCache"("expiresAt");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

-- CreateIndex
CREATE INDEX "AuthorizationCode_expiresAt_idx" ON "AuthorizationCode"("expiresAt");

-- CreateIndex
CREATE INDEX "Budget_userId_idx" ON "Budget"("userId");

-- CreateIndex
CREATE INDEX "Budget_categoryId_idx" ON "Budget"("categoryId");

-- CreateIndex
CREATE INDEX "Goal_accountId_idx" ON "Goal"("accountId");

-- CreateIndex
CREATE INDEX "OAuthRefreshToken_expiresAt_idx" ON "OAuthRefreshToken"("expiresAt");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE INDEX "Transaction_recurringFromAccountId_idx" ON "Transaction"("recurringFromAccountId");

-- CreateIndex
CREATE INDEX "Transaction_recurringToAccountId_idx" ON "Transaction"("recurringToAccountId");

-- CreateIndex
CREATE INDEX "TransactionItem_categoryId_idx" ON "TransactionItem"("categoryId");

-- Tokens, codes and grants naming a client that isn't registered can't be used
-- (the client lookup fails), so they go before the foreign keys that would reject them.
DELETE FROM "AuthorizationCode" WHERE "clientId" NOT IN (SELECT "clientId" FROM "OAuthClient");
DELETE FROM "OAuthRefreshToken" WHERE "clientId" NOT IN (SELECT "clientId" FROM "OAuthClient");
DELETE FROM "OAuthGrant" WHERE "clientId" NOT IN (SELECT "clientId" FROM "OAuthClient");

-- AddForeignKey
ALTER TABLE "AuthorizationCode" ADD CONSTRAINT "AuthorizationCode_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthRefreshToken" ADD CONSTRAINT "OAuthRefreshToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthGrant" ADD CONSTRAINT "OAuthGrant_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ledger integrity the application already enforces, now enforced by the database too.
ALTER TABLE "TransactionItem" ADD CONSTRAINT "TransactionItem_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_recurringAmount_positive" CHECK ("recurringAmount" IS NULL OR "recurringAmount" > 0);

-- Category's @@unique([userId, name, type]) lets duplicates through for system
-- categories because userId is NULL and NULLs are distinct in a unique index.
-- Skipped (with a notice) if duplicates already exist, so the deploy never fails on data.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Category" WHERE "userId" IS NULL
    GROUP BY "name", "type" HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'Duplicate system categories exist; Category_system_name_type_key not created';
  ELSE
    CREATE UNIQUE INDEX "Category_system_name_type_key" ON "Category"("name", "type") WHERE "userId" IS NULL;
  END IF;
END $$;
