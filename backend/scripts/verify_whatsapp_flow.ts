
import { PrismaClient, OrderStatus, PaymentStatus } from '@prisma/client';
import dotenv from 'dotenv';
import crypto from 'crypto';
import path from 'path';

// Load env vars from backend root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

async function main() {
    console.log('🚀 Starting WhatsApp Flow Verification...');

    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
    if (!PAYSTACK_SECRET) {
        console.error('❌ Missing PAYSTACK_SECRET_KEY in .env');
        process.exit(1);
    }

    // 1. Setup Test Data
    console.log('📦 Setting up test data...');

    // Create or find test vendor
    const vendorEmail = 'test_integration@tanna.local';
    let vendor = await prisma.vendor.findUnique({ where: { email: vendorEmail } });

    if (!vendor) {
        vendor = await prisma.vendor.create({
            data: {
                email: vendorEmail,
                passwordHash: 'dummy',
                phone: '+2348000000000', // Test phone
            }
        });
    }

    // Upsert store
    const store = await prisma.store.upsert({
        where: { vendorId: vendor.id },
        update: {},
        create: {
            vendorId: vendor.id,
            name: 'Integration Test Store',
            slug: 'test-integration-store',
        }
    });

    // Create unique reference
    const reference = `TEST_PAY_${Date.now()}`;
    const amountKobo = 500000; // 5000 NGN

    // Create Order & Payment
    const order = await prisma.order.create({
        data: {
            vendorId: vendor.id,
            buyerPhone: '+2348123456789', // Test buyer phone
            buyerEmail: 'buyer@test.local',
            totalAmountKobo: amountKobo,
            status: OrderStatus.AWAITING_PAYMENT,
            items: {
                create: {
                    productName: 'Test Product',
                    unitPriceKobo: amountKobo,
                    quantity: 1,
                    originalProductId: 'test-product-id' // Dummy
                }
            },
            payment: {
                create: {
                    internalRef: reference,
                    amountKobo: amountKobo,
                    currency: 'NGN',
                    status: PaymentStatus.PENDING,
                    paystackRef: `PAYSTACK_${reference}`,
                }
            }
        },
        include: { payment: true }
    });

    console.log(`✅ Created Test Order: ${order.id}`);
    console.log(`✅ Created Test Payment: ${order.payment?.id} (Ref: ${reference})`);

    // 2. Simulate Payload
    const payload = {
        event: 'charge.success',
        data: {
            id: Math.floor(Math.random() * 1000000),
            domain: 'test',
            status: 'success',
            reference: reference, // Key: Matches our internal ref
            amount: amountKobo,
            currency: 'NGN',
            gateway_response: 'Successful',
            paid_at: new Date().toISOString(),
            customer: {
                email: 'buyer@test.local',
            }
        }
    };

    const payloadString = JSON.stringify(payload);

    // 3. Generate Signature
    const signature = crypto
        .createHmac('sha512', PAYSTACK_SECRET)
        .update(payloadString)
        .digest('hex');

    console.log('📡 Sending Webhook to localhost:3000...');

    try {
        const response = await fetch('http://localhost:3000/api/webhooks/paystack', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-paystack-signature': signature
            },
            body: payloadString
        });

        if (!response.ok) {
            throw new Error(`Webhook request failed: ${response.status} ${response.statusText}`);
        }

        const responseData = await response.json();
        console.log('✅ Webhook Response:', responseData);

    } catch (error) {
        console.error('❌ Webhook call failed:', error);
        process.exit(1);
    }

    // 4. Verify Results
    console.log('🔍 Verifying Database State...');

    // Check Order Status (Poll a few times)
    let confirmed = false;
    for (let i = 0; i < 5; i++) {
        const updatedOrder = await prisma.order.findUnique({
            where: { id: order.id }
        });

        if (updatedOrder?.status === OrderStatus.CONFIRMED) {
            console.log('✅ Order Status: CONFIRMED');
            confirmed = true;
            break;
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    if (!confirmed) {
        console.error('❌ Order check timed out. Status is NOT confirmed.');
    }

    // Check Message Logs
    const logs = await prisma.messageLog.findMany({
        where: { orderId: order.id }
    });

    if (logs.length > 0) {
        console.log('✅ Message Logs Found:');
        logs.forEach(log => {
            console.log(`   - [${log.templateName}] ${log.status} (Provider ID: ${log.providerMessageId})`);
        });
        if (logs.length >= 2) {
            console.log('🎉 SUCCESS: Both buyer and vendor notifications triggered.');
        } else {
            console.log('⚠️ PARTIAL SUCCESS: Found logs but fewer than expected.');
        }
    } else {
        console.error('❌ No message logs found for this order.');
    }

    await prisma.$disconnect();
}

main().catch(console.error);
