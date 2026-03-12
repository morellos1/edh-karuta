-- CreateTable
CREATE TABLE "ExtraClaim" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" DATETIME
);

-- CreateIndex
CREATE INDEX "ExtraClaim_userId_usedAt_idx" ON "ExtraClaim"("userId", "usedAt");
