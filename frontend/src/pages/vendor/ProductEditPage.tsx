import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { ProductForm } from '../../components/ProductForm';

export function ProductEditPage() {
    const { productId } = useParams();
    const navigate = useNavigate();
    const [formData, setFormData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchProduct = async () => {
            try {
                const response = await api.get(`/api/products/${productId}`);
                const product = response.data.product;

                setFormData({
                    name: product.name,
                    price: product.price / 100, // Convert Kobo to Naira for display
                    description: product.description || '',
                    currency: product.currency,
                });
            } catch (err: any) {
                setError(err.response?.data?.message || err.message || 'Failed to fetch product');
            } finally {
                setLoading(false);
            }
        };

        if (productId) {
            fetchProduct();
        }
    }, [productId]);

    const handleSubmit = async (data: { name: string; price: number | ''; description: string; currency: string }) => {
        setIsSubmitting(true);
        setError(null);

        try {
            await api.put(`/api/products/${productId}`, {
                name: data.name,
                price: Math.round(Number(data.price) * 100), // Convert Naira to Kobo
                description: data.description,
                currency: data.currency,
            });

            // Navigate back to product list
            navigate('../products');
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || 'Failed to update product');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return <div>Loading...</div>;

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
                <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Edit Product</h2>
            </div>

            <ProductForm
                initialData={formData}
                submitLabel="Save Changes"
                onSubmit={handleSubmit}
                isSubmitting={isSubmitting}
                error={error}
            />
        </div>
    );
}
