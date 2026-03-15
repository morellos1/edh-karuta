-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Card" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "scryfallId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "setCode" TEXT NOT NULL,
    "setName" TEXT,
    "collectorNumber" TEXT NOT NULL,
    "releasedAt" TEXT,
    "lang" TEXT,
    "usdPrice" TEXT,
    "eurPrice" TEXT,
    "manaCost" TEXT,
    "typeLine" TEXT,
    "oracleText" TEXT,
    "power" TEXT,
    "toughness" TEXT,
    "colors" TEXT,
    "colorIdentity" TEXT,
    "imagePng" TEXT,
    "imageSmall" TEXT,
    "imageNormal" TEXT,
    "imageLarge" TEXT,
    "layout" TEXT,
    "isBasicLand" BOOLEAN NOT NULL DEFAULT false,
    "isCommanderLegal" BOOLEAN NOT NULL DEFAULT false,
    "isMeldResult" BOOLEAN NOT NULL DEFAULT false,
    "rarity" TEXT,
    "randomWeight" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Card" ("collectorNumber", "colorIdentity", "colors", "createdAt", "eurPrice", "id", "imageLarge", "imageNormal", "imagePng", "imageSmall", "isBasicLand", "isCommanderLegal", "lang", "layout", "manaCost", "name", "oracleText", "power", "randomWeight", "rarity", "releasedAt", "scryfallId", "setCode", "setName", "toughness", "typeLine", "updatedAt", "usdPrice") SELECT "collectorNumber", "colorIdentity", "colors", "createdAt", "eurPrice", "id", "imageLarge", "imageNormal", "imagePng", "imageSmall", "isBasicLand", "isCommanderLegal", "lang", "layout", "manaCost", "name", "oracleText", "power", "randomWeight", "rarity", "releasedAt", "scryfallId", "setCode", "setName", "toughness", "typeLine", "updatedAt", "usdPrice" FROM "Card";
DROP TABLE "Card";
ALTER TABLE "new_Card" RENAME TO "Card";
CREATE UNIQUE INDEX "Card_scryfallId_key" ON "Card"("scryfallId");
CREATE INDEX "Card_name_idx" ON "Card"("name");
CREATE INDEX "Card_setCode_collectorNumber_idx" ON "Card"("setCode", "collectorNumber");
CREATE INDEX "Card_isCommanderLegal_lang_isBasicLand_rarity_idx" ON "Card"("isCommanderLegal", "lang", "isBasicLand", "rarity");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
