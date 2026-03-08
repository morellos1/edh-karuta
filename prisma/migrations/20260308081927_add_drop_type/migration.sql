-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Drop" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "dropperUserId" TEXT NOT NULL,
    "dropType" TEXT NOT NULL DEFAULT 'regular',
    "expiresAt" DATETIME NOT NULL,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Drop" ("channelId", "createdAt", "dropperUserId", "expiresAt", "guildId", "id", "messageId", "resolvedAt") SELECT "channelId", "createdAt", "dropperUserId", "expiresAt", "guildId", "id", "messageId", "resolvedAt" FROM "Drop";
DROP TABLE "Drop";
ALTER TABLE "new_Drop" RENAME TO "Drop";
CREATE UNIQUE INDEX "Drop_messageId_key" ON "Drop"("messageId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
