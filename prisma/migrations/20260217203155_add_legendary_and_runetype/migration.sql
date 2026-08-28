-- AlterTable
ALTER TABLE "Item" ADD COLUMN "runeType" TEXT;

-- CreateIndex
CREATE INDEX "Item_runeType_idx" ON "Item"("runeType");

-- CreateIndex
CREATE INDEX "Item_rarity_runeType_idx" ON "Item"("rarity", "runeType");
