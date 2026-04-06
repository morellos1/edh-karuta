-- AlterTable
ALTER TABLE "Wishlist" ADD COLUMN "cardNameNormalized" TEXT;

-- Backfill: strip punctuation and lowercase existing entries
UPDATE "Wishlist" SET "cardNameNormalized" = LOWER(
  REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    "cardName",
    '''', ''), '-', ''), ',', ''), '.', ''), ':', ''), ';', ''), '"', ''), '!', ''), '?', '')
);

-- CreateIndex
CREATE INDEX "Wishlist_guildId_cardNameNormalized_idx" ON "Wishlist"("guildId", "cardNameNormalized");
