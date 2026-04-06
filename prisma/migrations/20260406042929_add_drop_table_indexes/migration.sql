-- CreateIndex
CREATE INDEX "Drop_createdAt_idx" ON "Drop"("createdAt");

-- CreateIndex
CREATE INDEX "Drop_dropperUserId_createdAt_idx" ON "Drop"("dropperUserId", "createdAt");
