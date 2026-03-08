-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserCard" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "cardId" INTEGER NOT NULL,
    "dropId" INTEGER NOT NULL,
    "condition" TEXT NOT NULL DEFAULT 'good',
    "claimedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserCard_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "Drop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserCard" ("cardId", "claimedAt", "dropId", "id", "userId") SELECT "cardId", "claimedAt", "dropId", "id", "userId" FROM "UserCard";
DROP TABLE "UserCard";
ALTER TABLE "new_UserCard" RENAME TO "UserCard";
CREATE INDEX "UserCard_userId_claimedAt_idx" ON "UserCard"("userId", "claimedAt");
CREATE UNIQUE INDEX "UserCard_userId_dropId_key" ON "UserCard"("userId", "dropId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
