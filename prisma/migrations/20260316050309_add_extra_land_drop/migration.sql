-- CreateTable
CREATE TABLE "ExtraLandDrop" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" DATETIME
);

-- CreateIndex
CREATE INDEX "ExtraLandDrop_userId_usedAt_idx" ON "ExtraLandDrop"("userId", "usedAt");
