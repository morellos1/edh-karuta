-- DropIndex: allow multiple UserCards with same (userId, dropId) so trades/gives can complete
-- (one-claim-per-drop is still enforced at claim time in application code)
DROP INDEX "UserCard_userId_dropId_key";
-- Non-unique index for claim-time lookups
CREATE INDEX "UserCard_userId_dropId_idx" ON "UserCard"("userId", "dropId");
