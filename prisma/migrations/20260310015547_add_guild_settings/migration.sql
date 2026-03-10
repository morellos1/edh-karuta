-- CreateTable
CREATE TABLE "LanddropCooldown" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "lastUsedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GuildSettings" (
    "guildId" TEXT NOT NULL PRIMARY KEY,
    "prefix" TEXT NOT NULL DEFAULT 'k',
    "shortcutsEnabled" BOOLEAN NOT NULL DEFAULT false
);
