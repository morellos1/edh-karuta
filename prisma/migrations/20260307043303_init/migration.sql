-- CreateTable
CREATE TABLE "Card" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "scryfallId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "setCode" TEXT NOT NULL,
    "collectorNumber" TEXT NOT NULL,
    "manaCost" TEXT,
    "typeLine" TEXT,
    "oracleText" TEXT,
    "imageSmall" TEXT,
    "imageNormal" TEXT,
    "imageLarge" TEXT,
    "isBasicLand" BOOLEAN NOT NULL DEFAULT false,
    "isCommanderLegal" BOOLEAN NOT NULL DEFAULT false,
    "rarity" TEXT,
    "randomWeight" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserCard" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "cardId" INTEGER NOT NULL,
    "dropId" INTEGER NOT NULL,
    "claimedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserCard_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "Drop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Drop" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "dropperUserId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DropSlot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dropId" INTEGER NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "cardId" INTEGER NOT NULL,
    "claimedByUserId" TEXT,
    "claimedAt" DATETIME,
    CONSTRAINT "DropSlot_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "Drop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DropSlot_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Card_scryfallId_key" ON "Card"("scryfallId");

-- CreateIndex
CREATE INDEX "Card_name_idx" ON "Card"("name");

-- CreateIndex
CREATE INDEX "Card_setCode_collectorNumber_idx" ON "Card"("setCode", "collectorNumber");

-- CreateIndex
CREATE INDEX "UserCard_userId_claimedAt_idx" ON "UserCard"("userId", "claimedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserCard_userId_dropId_key" ON "UserCard"("userId", "dropId");

-- CreateIndex
CREATE UNIQUE INDEX "Drop_messageId_key" ON "Drop"("messageId");

-- CreateIndex
CREATE INDEX "DropSlot_dropId_claimedByUserId_idx" ON "DropSlot"("dropId", "claimedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "DropSlot_dropId_slotIndex_key" ON "DropSlot"("dropId", "slotIndex");
