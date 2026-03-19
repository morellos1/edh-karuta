-- CreateTable
CREATE TABLE "EndlessTowerRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "discordId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userCardId" INTEGER NOT NULL,
    "bestFloor" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EndlessTowerRecord_userCardId_fkey" FOREIGN KEY ("userCardId") REFERENCES "UserCard" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EndlessTowerReward" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "floor" INTEGER NOT NULL,
    "claimedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "EndlessTowerRecord_discordId_guildId_idx" ON "EndlessTowerRecord"("discordId", "guildId");

-- CreateIndex
CREATE UNIQUE INDEX "EndlessTowerRecord_discordId_guildId_userCardId_key" ON "EndlessTowerRecord"("discordId", "guildId", "userCardId");

-- CreateIndex
CREATE INDEX "EndlessTowerReward_userId_idx" ON "EndlessTowerReward"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EndlessTowerReward_userId_floor_key" ON "EndlessTowerReward"("userId", "floor");
