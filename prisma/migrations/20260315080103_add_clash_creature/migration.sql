-- CreateTable
CREATE TABLE "ClashCreature" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "discordId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userCardId" INTEGER NOT NULL,
    CONSTRAINT "ClashCreature_userCardId_fkey" FOREIGN KEY ("userCardId") REFERENCES "UserCard" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ClashCreature_discordId_guildId_key" ON "ClashCreature"("discordId", "guildId");
