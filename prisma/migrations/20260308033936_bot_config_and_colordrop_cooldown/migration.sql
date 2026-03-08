-- CreateTable
CREATE TABLE "BotConfig" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ColordropCooldown" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "lastUsedAt" DATETIME NOT NULL
);
