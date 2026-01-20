/*
  Warnings:

  - The values [SUCCESS] on the enum `PaymentStatus` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[internal_ref]` on the table `payments` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `internal_ref` to the `payments` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PaymentStatus_new" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');
ALTER TABLE "payments" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "payments" ALTER COLUMN "status" TYPE "PaymentStatus_new" USING ("status"::text::"PaymentStatus_new");
ALTER TYPE "PaymentStatus" RENAME TO "PaymentStatus_old";
ALTER TYPE "PaymentStatus_new" RENAME TO "PaymentStatus";
DROP TYPE "PaymentStatus_old";
ALTER TABLE "payments" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'NGN',
ADD COLUMN     "failed_at" TIMESTAMP(3),
ADD COLUMN     "failure_reason" TEXT,
ADD COLUMN     "internal_ref" TEXT NOT NULL,
ADD COLUMN     "metadata" JSONB,
ALTER COLUMN "order_id" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "payments_internal_ref_key" ON "payments"("internal_ref");

-- CreateIndex
CREATE INDEX "payments_internal_ref_idx" ON "payments"("internal_ref");
