/*
  Warnings:

  - A unique constraint covering the columns `[vendor_id]` on the table `stores` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `password_hash` to the `vendors` table without a default value. This is not possible if the table is not empty.
  - Added the required column `phone` to the `vendors` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "stores_vendor_id_idx";

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'NGN',
ADD COLUMN     "delivery_estimate_text" TEXT;

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "password_hash" TEXT NOT NULL,
ADD COLUMN     "phone" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "stores_vendor_id_key" ON "stores"("vendor_id");
