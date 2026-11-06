-- CreateEnum
CREATE TYPE "DraftSource" AS ENUM ('COMPOSER', 'CHAT', 'VOICE', 'MCP');

-- AlterTable
ALTER TABLE "AiChatMessage" ADD COLUMN     "draftIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "DraftTransaction" ADD COLUMN     "source" "DraftSource" NOT NULL DEFAULT 'COMPOSER',
ADD COLUMN     "sourceClient" TEXT;
