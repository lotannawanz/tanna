/*
  Warnings:

  - You are about to drop the column `product_desc` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `product_id` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `product_name` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `product_price_kobo` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `order_id` on the `payments` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[payment_id]` on the table `orders` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `total_amount_kobo` to the `orders` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('CREATED', 'AWAITING_PAYMENT', 'CONFIRMED', 'FULFILLED', 'CANCELLED', 'REFUNDED');

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_product_id_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_order_id_fkey";

-- DropIndex
DROP INDEX "orders_product_id_idx";

-- DropIndex
DROP INDEX "payments_order_id_key";

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "product_desc",
DROP COLUMN "product_id",
DROP COLUMN "product_name",
DROP COLUMN "product_price_kobo",
ADD COLUMN     "confirmed_at" TIMESTAMP(3),
ADD COLUMN     "fulfilled_at" TIMESTAMP(3),
ADD COLUMN     "payment_id" TEXT,
ADD COLUMN     "status" "OrderStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
ADD COLUMN     "total_amount_kobo" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "payments" DROP COLUMN "order_id";

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "unit_price_kobo" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "original_product_id" TEXT,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_payment_id_key" ON "orders"("payment_id");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
