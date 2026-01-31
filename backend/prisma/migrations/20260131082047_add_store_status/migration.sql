-- CreateEnum
CREATE TYPE "StoreStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "status" "StoreStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE INDEX "stores_status_idx" ON "stores"("status");
