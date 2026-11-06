-- Transactions created after the shared accounts schema landed but before the
-- app started recording authors. Only owners could post until now.
UPDATE "Transaction" SET "createdById" = "userId" WHERE "createdById" IS NULL;
