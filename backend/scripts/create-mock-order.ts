import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Creating mock order and payment for testing...');

    // Get the test vendor and product
    const vendor = await prisma.vendor.findFirst({ where: { email: 'test@tanna.shop' } });
    const product = await prisma.product.findFirst({ where: { slug: 'test-product' } });

    if (!vendor || !product) {
        console.error('Run seed-test-data.ts first');
        return;
    }

    // Create a test payment (CONFIRMED status)
    const payment = await prisma.payment.create({
        data: {
            internalRef: `TANNA_TEST_${Date.now()}`,
            paystackRef: `PSK_TEST_${Date.now()}`,
            amountKobo: 500000,  // ₦5,000
            currency: 'NGN',
            status: 'CONFIRMED',
            verifiedAt: new Date(),
        }
    });
    console.log('Payment ID:', payment.id);
    console.log('Payment Ref:', payment.internalRef);

    // Create a test order linked to the payment
    const order = await prisma.order.create({
        data: {
            vendorId: vendor.id,
            paymentId: payment.id,
            status: 'CONFIRMED',
            buyerPhone: '+2347011671774',
            buyerEmail: 'buyer@test.com',
            totalAmountKobo: 500000,
            confirmedAt: new Date(),
            items: {
                create: [
                    {
                        productName: product.name,
                        unitPriceKobo: product.price,
                        quantity: 1,
                        originalProductId: product.id,
                    }
                ]
            }
        }
    });
    console.log('Order ID:', order.id);

    console.log('\n=== TEST THE CONFIRMATION PAGE ===');
    console.log(`http://localhost:5173/payment/verify?reference=${payment.internalRef}`);

    await prisma.$disconnect();
}

main().catch(console.error);
