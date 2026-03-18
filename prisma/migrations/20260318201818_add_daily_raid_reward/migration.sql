-- CreateTable
CREATE TABLE "DailyRaidReward" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "dateStr" TEXT NOT NULL,
    "claimedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "DailyRaidReward_userId_idx" ON "DailyRaidReward"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyRaidReward_userId_dateStr_key" ON "DailyRaidReward"("userId", "dateStr");
