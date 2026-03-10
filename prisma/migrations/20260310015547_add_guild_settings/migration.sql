-- CreateTable
CREATE TABLE "GuildSettings" (
    "guildId" TEXT NOT NULL PRIMARY KEY,
    "prefix" TEXT NOT NULL DEFAULT 'k',
    "shortcutsEnabled" BOOLEAN NOT NULL DEFAULT false
);
