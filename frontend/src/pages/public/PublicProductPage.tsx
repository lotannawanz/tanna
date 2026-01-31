import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { publicApi } from '../../lib/api';
import { BuyerInfoForm } from '../../components/public/BuyerInfoForm';

interface ProductData {
    name: string;
    description: string;
    price: number; // in kobo
    currency: string;
}

interface StoreData {
    name: string;
}

export function PublicProductPage() {
    const { storeSlug, productSlug } = useParams<{ storeSlug: string; productSlug: string }>();

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<{ product: ProductData; store: StoreData } | null>(null);
    const [showCheckout, setShowCheckout] = useState(false);

    useEffect(() => {
        if (!storeSlug || !productSlug) return;

        const fetchData = async () => {
            try {
                const result = await publicApi.getProduct(storeSlug, productSlug);
                setData(result);
            } catch (err) {
                setError('Product not found or store unavailable.');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [storeSlug, productSlug]);

    const handleCheckout = async (formData: { name: string; phone: string }) => {
        if (!storeSlug || !productSlug) return;

        setSubmitting(true);
        try {
            // Callback URL will be handled by backend or default
            // Constructing callback URL manually to include origin
            const callbackUrl = `${window.location.origin}/verify`;

            const result = await publicApi.checkout({
                productSlug,
                storeSlug,
                buyerPhone: formData.phone,
                // buyerName: formData.name, // Backend doesn't support this yet in order table, optional
                callbackUrl
            });

            // Redirect to Paystack
            if (result.authorizationUrl) {
                window.location.href = result.authorizationUrl;
            } else {
                setError('Failed to initialize payment.');
            }
        } catch (err) {
            setError('Checkout failed. Please try again.');
            setSubmitting(false);
        }
    };

    if (loading) {
        return <div style={{ padding: 'var(--space-4)', textAlign: 'center' }}>Loading...</div>;
    }

    if (error || !data) {
        return (
            <div style={{ padding: 'var(--space-4)', textAlign: 'center', maxWidth: '400px', margin: '0 auto' }}>
                <h2>Oops!</h2>
                <p style={{ color: 'var(--text-secondary)' }}>{error || 'Something went wrong'}</p>
            </div>
        );
    }

    const formattedPrice = new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: data.product.currency,
    }).format(data.product.price / 100);

    return (
        <div style={{
            maxWidth: '480px',
            margin: '0 auto',
            minHeight: '100vh',
            padding: 'var(--space-4)',
            display: 'flex',
            flexDirection: 'column'
        }}>
            {/* Header: Store Name */}
            <header style={{
                marginBottom: 'var(--space-6)',
                textAlign: 'center',
                borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: 'var(--space-3)'
            }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {data.store.name}
                </h3>
            </header>

            {/* Product Details */}
            <main style={{ flex: 1 }}>
                <div style={{ marginBottom: 'var(--space-4)' }}>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
                        {data.product.name}
                    </h1>
                    <p style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {formattedPrice}
                    </p>
                </div>

                {data.product.description && (
                    <div style={{
                        color: 'var(--text-secondary)',
                        lineHeight: 1.6,
                        marginBottom: 'var(--space-8)'
                    }}>
                        {data.product.description}
                    </div>
                )}

                {/* Checkout Section */}
                {!showCheckout ? (
                    <button
                        onClick={() => setShowCheckout(true)}
                        style={{
                            width: '100%',
                            padding: 'var(--space-4)',
                            backgroundColor: 'var(--color-black)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '1.1rem',
                            fontWeight: 600,
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}
                    >
                        Buy Now
                    </button>
                ) : (
                    <div style={{
                        marginTop: 'var(--space-4)',
                        padding: 'var(--space-4)',
                        backgroundColor: 'var(--bg-surface)',
                        borderRadius: '12px',
                        border: '1px solid var(--border-subtle)',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
                    }}>
                        <h3 style={{ marginBottom: 'var(--space-4)', fontSize: '1.1rem' }}>Enter Details</h3>
                        <BuyerInfoForm
                            onSubmit={handleCheckout}
                            isLoading={submitting}
                            totalAmountKobo={data.product.price}
                            currency={data.product.currency}
                        />
                        <button
                            onClick={() => setShowCheckout(false)}
                            style={{
                                marginTop: 'var(--space-3)',
                                width: '100%',
                                padding: 'var(--space-2)',
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-secondary)',
                                textDecoration: 'underline'
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                )}
            </main>

            <footer style={{
                marginTop: 'var(--space-8)',
                textAlign: 'center',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)'
            }}>
                Powered by Tanna
            </footer>
        </div>
    );
}
