/*
  Warnings:

  - You are about to drop the column `currency` on the `Goal` table. All the data in the column will be lost.
  - You are about to drop the column `currentAmount` on the `Goal` table. All the data in the column will be lost.
  - You are about to drop the column `targetDate` on the `Goal` table. All the data in the column will be lost.
  - Added the required column `accountId` to the `Goal` table without a default value. This is not possible if the table is not empty.
  - Added the required column `periodStart` to the `Goal` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `Goal` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('BALANCE', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "GoalRecurrenceUnit" AS ENUM ('MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('IN_PROGRESS', 'ACHIEVED', 'FAILED');

-- AlterTable
ALTER TABLE "Goal" DROP COLUMN "currency",
DROP COLUMN "currentAmount",
DROP COLUMN "targetDate",
ADD COLUMN     "accountId" TEXT NOT NULL,
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "isRecurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "periodEnd" TIMESTAMP(3),
ADD COLUMN     "periodStart" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "recurrenceUnit" "GoalRecurrenceUnit",
ADD COLUMN     "type" "GoalType" NOT NULL;

-- CreateTable
CREATE TABLE "GoalInstance" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "targetAmount" DECIMAL(18,4) NOT NULL,
    "progressAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "status" "GoalStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalInstance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoalInstance_status_periodEnd_idx" ON "GoalInstance"("status", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "GoalInstance_goalId_periodStart_key" ON "GoalInstance"("goalId", "periodStart");

-- CreateIndex
CREATE INDEX "Goal_userId_archivedAt_idx" ON "Goal"("userId", "archivedAt");

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalInstance" ADD CONSTRAINT "GoalInstance_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
