-- CreateTable
CREATE TABLE "ClaimCooldown" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "lastClaimedAt" DATETIME NOT NULL
);
