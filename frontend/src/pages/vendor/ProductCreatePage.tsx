import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { ProductForm } from '../../components/ProductForm';

export function ProductCreatePage() {
    const navigate = useNavigate();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (data: { name: string; price: number | ''; description: string; currency: string }) => {
        setIsSubmitting(true);
        setError(null);

        try {
            await api.post('/api/products', {
                name: data.name,
                price: Math.round(Number(data.price) * 100), // Convert Naira to Kobo
                description: data.description,
                currency: data.currency,
            });

            // Navigate back to product list
            navigate('../products');
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || 'Failed to create product');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div>
            <div style={{ marginBottom: 'var(--space-6)' }}>
                <button
                    onClick={() => navigate('../products')}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        padding: 0,
                        fontSize: '0.875rem',
                        marginBottom: 'var(--space-2)'
                    }}
                >
                    ← Back to Products
                </button>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Add New Product</h2>
            </div>

            <ProductForm
                submitLabel="Create Product"
                onSubmit={handleSubmit}
                isSubmitting={isSubmitting}
                error={error}
            />
        </div>
    );
}
