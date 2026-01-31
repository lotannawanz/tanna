import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Creating test data...');

    // Create a test vendor
    const vendor = await prisma.vendor.upsert({
        where: { email: 'test@tanna.shop' },
        update: {},
        create: {
            email: 'test@tanna.shop',
            passwordHash: 'test-hash',
            phone: '+2347011671774',
        }
    });
    console.log('Vendor ID:', vendor.id);

    // Create a store for the vendor
    const store = await prisma.store.upsert({
        where: { vendorId: vendor.id },
        update: {},
        create: {
            vendorId: vendor.id,
            name: 'Demo Store',
            slug: 'demo-store',
        }
    });
    console.log('Store ID:', store.id);

    // Create a test product
    const product = await prisma.product.upsert({
        where: { storeId_slug: { storeId: store.id, slug: 'test-product' } },
        update: {},
        create: {
            storeId: store.id,
            name: 'Premium Widget',
            slug: 'test-product',
            price: 500000,
            description: 'A high-quality test product',
        }
    });
    console.log('Product ID:', product.id);

    // Output for use in checkout
    console.log('\n=== Use these for checkout ===');
    console.log('VENDOR_ID=' + vendor.id);
    console.log('PRODUCT_ID=' + product.id);

    await prisma.$disconnect();
}

main().catch(console.error);
