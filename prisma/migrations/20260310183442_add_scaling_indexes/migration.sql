-- CreateTable
CREATE TABLE "LanddropCooldown" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "lastUsedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Card_isCommanderLegal_lang_isBasicLand_rarity_idx" ON "Card"("isCommanderLegal", "lang", "isBasicLand", "rarity");

-- CreateIndex
CREATE INDEX "UserCard_cardId_idx" ON "UserCard"("cardId");
