-- CreateEnum
CREATE TYPE "AppPlatform" AS ENUM ('ANDROID', 'IOS');

-- CreateTable
CREATE TABLE "AppRelease" (
    "id" TEXT NOT NULL,
    "platform" "AppPlatform" NOT NULL,
    "version" TEXT NOT NULL,
    "build" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "legacyUrl" TEXT,
    "notes" TEXT[],
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppRelease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppRelease_platform_withdrawnAt_build_idx" ON "AppRelease"("platform", "withdrawnAt", "build");

-- CreateIndex
CREATE UNIQUE INDEX "AppRelease_platform_build_key" ON "AppRelease"("platform", "build");
