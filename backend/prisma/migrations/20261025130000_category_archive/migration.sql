-- Categories in use can be archived instead of deleted.

-- AlterTable
ALTER TABLE "Category" ADD COLUMN "archivedAt" TIMESTAMP(3);
