-- Drop the old single-column name index and replace with composite
DROP INDEX IF EXISTS "Card_name_idx";
CREATE INDEX "Card_name_releasedAt_idx" ON "Card"("name", "releasedAt");

-- Add composite index for the drop pool groupBy hot path (filters imagePng)
CREATE INDEX "Card_isCommanderLegal_lang_isBasicLand_imagePng_idx" ON "Card"("isCommanderLegal", "lang", "isBasicLand", "imagePng");
