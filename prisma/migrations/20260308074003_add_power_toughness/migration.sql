-- AlterTable
ALTER TABLE "Card" ADD COLUMN "power" TEXT;
ALTER TABLE "Card" ADD COLUMN "toughness" TEXT;

-- CreateTable
CREATE TABLE "CommanderdropCooldown" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "lastUsedAt" DATETIME NOT NULL
);
