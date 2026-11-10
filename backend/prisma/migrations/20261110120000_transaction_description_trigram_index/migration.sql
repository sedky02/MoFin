CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "Transaction_description_idx" ON "Transaction" USING GIN ("description" gin_trgm_ops);
