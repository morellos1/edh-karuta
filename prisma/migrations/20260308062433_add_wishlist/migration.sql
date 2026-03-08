-- CreateTable
CREATE TABLE "Wishlist" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "cardName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DropCooldown" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "lastUsedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Wishlist_guildId_cardName_idx" ON "Wishlist"("guildId", "cardName");

-- CreateIndex
CREATE UNIQUE INDEX "Wishlist_userId_guildId_cardName_key" ON "Wishlist"("userId", "guildId", "cardName");
