-- CreateIndex (IF NOT EXISTS for databases that already have it via db push)
CREATE INDEX IF NOT EXISTS "Card_isCommanderLegal_lang_isBasicLand_imagePng_idx" ON "Card"("isCommanderLegal", "lang", "isBasicLand", "imagePng");
