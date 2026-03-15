-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ClashCreature" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "discordId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userCardId" INTEGER NOT NULL,
    "clashWins" INTEGER NOT NULL DEFAULT 0,
    "clashLosses" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ClashCreature_userCardId_fkey" FOREIGN KEY ("userCardId") REFERENCES "UserCard" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ClashCreature" ("discordId", "guildId", "id", "userCardId") SELECT "discordId", "guildId", "id", "userCardId" FROM "ClashCreature";
DROP TABLE "ClashCreature";
ALTER TABLE "new_ClashCreature" RENAME TO "ClashCreature";
CREATE UNIQUE INDEX "ClashCreature_discordId_guildId_key" ON "ClashCreature"("discordId", "guildId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
