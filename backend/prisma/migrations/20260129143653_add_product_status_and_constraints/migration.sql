/*
  Warnings:

  - You are about to drop the column `is_active` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `quantity` on the `products` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[store_id,slug]` on the table `products` will be added. If there are existing duplicate values, this will fail.
  - Made the column `slug` on table `products` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- DropIndex
DROP INDEX "products_is_active_idx";

-- DropIndex
DROP INDEX "products_slug_key";

-- AlterTable
ALTER TABLE "products" DROP COLUMN "is_active",
DROP COLUMN "quantity",
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'NGN',
ADD COLUMN     "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE INDEX "products_status_idx" ON "products"("status");

-- CreateIndex
CREATE UNIQUE INDEX "products_store_id_slug_key" ON "products"("store_id", "slug");
