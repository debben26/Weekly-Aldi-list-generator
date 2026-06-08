-- CreateEnum
CREATE TYPE "ReceiptImportStatus" AS ENUM ('pending_review', 'completed');

-- CreateEnum
CREATE TYPE "ReceiptLineMatchStatus" AS ENUM ('auto_matched', 'confirmed', 'needs_review', 'unmatched', 'new_item');

-- AlterEnum
ALTER TYPE "PriceSourceType" ADD VALUE 'receipt';

-- AlterTable
ALTER TABLE "PriceObservation" ADD COLUMN     "receiptLineItemId" TEXT;

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "purchaseDate" DATE NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotal" DECIMAL(10,2),
    "tax" DECIMAL(10,2),
    "total" DECIMAL(10,2) NOT NULL,
    "rawImportJson" JSONB NOT NULL,
    "importStatus" "ReceiptImportStatus" NOT NULL DEFAULT 'pending_review',
    "dedupeHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptLineItem" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "rawName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" DECIMAL(10,4),
    "lineTotal" DECIMAL(10,2) NOT NULL,
    "matchedItemId" TEXT,
    "matchConfidence" DOUBLE PRECISION,
    "matchStatus" "ReceiptLineMatchStatus" NOT NULL DEFAULT 'unmatched',

    CONSTRAINT "ReceiptLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_dedupeHash_key" ON "Receipt"("dedupeHash");

-- CreateIndex
CREATE INDEX "Receipt_storeId_purchaseDate_idx" ON "Receipt"("storeId", "purchaseDate");

-- CreateIndex
CREATE INDEX "ReceiptLineItem_receiptId_idx" ON "ReceiptLineItem"("receiptId");

-- CreateIndex
CREATE INDEX "ReceiptLineItem_normalizedName_idx" ON "ReceiptLineItem"("normalizedName");

-- AddForeignKey
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_receiptLineItemId_fkey" FOREIGN KEY ("receiptLineItemId") REFERENCES "ReceiptLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptLineItem" ADD CONSTRAINT "ReceiptLineItem_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptLineItem" ADD CONSTRAINT "ReceiptLineItem_matchedItemId_fkey" FOREIGN KEY ("matchedItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
