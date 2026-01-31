/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `products` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "products" ADD COLUMN     "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");
