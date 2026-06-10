-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "tripSnapshotId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_tripSnapshotId_key" ON "Receipt"("tripSnapshotId");

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_tripSnapshotId_fkey" FOREIGN KEY ("tripSnapshotId") REFERENCES "TripSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
