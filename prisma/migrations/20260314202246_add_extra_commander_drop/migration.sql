-- CreateTable
CREATE TABLE "ExtraCommanderDrop" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" DATETIME
);

-- CreateIndex
CREATE INDEX "ExtraCommanderDrop_userId_usedAt_idx" ON "ExtraCommanderDrop"("userId", "usedAt");
