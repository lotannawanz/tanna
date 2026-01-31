import { useState, useEffect } from 'react';

interface ProductFormData {
    name: string;
    price: number | '';
    description: string;
    currency: string;
}

interface ProductFormProps {
    initialData?: ProductFormData;
    onSubmit: (data: ProductFormData) => Promise<void>;
    submitLabel: string;
    isSubmitting?: boolean;
    error?: string | null;
}

export function ProductForm({
    initialData,
    onSubmit,
    submitLabel,
    isSubmitting = false,
    error,
}: ProductFormProps) {
    const [formData, setFormData] = useState<ProductFormData>({
        name: '',
        price: '',
        description: '',
        currency: 'NGN',
    });

    useEffect(() => {
        if (initialData) {
            setFormData(initialData);
        }
    }, [initialData]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <form onSubmit={handleSubmit} style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
            maxWidth: '600px'
        }}>
            {error && (
                <div style={{
                    padding: 'var(--space-3)',
                    backgroundColor: '#fff1f0',
                    color: '#cf1322',
                    borderRadius: '8px',
                    fontSize: '0.875rem'
                }}>
                    {error}
                </div>
            )}

            <div>
                <label style={{ display: 'block', fontWeight: 500, marginBottom: 'var(--space-2)' }}>
                    Product Name <span style={{ color: 'red' }}>*</span>
                </label>
                <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="e.g. Vintage Denim Jacket"
                    style={{
                        width: '100%',
                        padding: 'var(--space-3)',
                        borderRadius: '6px',
                        border: '1px solid #ddd',
                        fontSize: '1rem'
                    }}
                />
            </div>

            <div>
                <label style={{ display: 'block', fontWeight: 500, marginBottom: 'var(--space-2)' }}>
                    Price (₦) <span style={{ color: 'red' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                    <span style={{
                        position: 'absolute',
                        left: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--text-secondary)',
                        fontWeight: 500
                    }}>₦</span>
                    <input
                        type="number"
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: e.target.value === '' ? '' : Number(e.target.value) })}
                        required
                        min="1"
                        step="0.01"
                        placeholder="5000"
                        style={{
                            width: '100%',
                            padding: 'var(--space-3)',
                            paddingLeft: '28px',
                            borderRadius: '6px',
                            border: '1px solid #ddd',
                            fontSize: '1rem'
                        }}
                    />
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 'var(--space-1)' }}>
                    Enter the price in Naira (e.g., 5000 for ₦5,000)
                </p>
            </div>

            <div>
                <label style={{ display: 'block', fontWeight: 500, marginBottom: 'var(--space-2)' }}>
                    Description
                </label>
                <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={4}
                    placeholder="Describe your product..."
                    style={{
                        width: '100%',
                        padding: 'var(--space-3)',
                        borderRadius: '6px',
                        border: '1px solid #ddd',
                        fontSize: '1rem',
                        fontFamily: 'inherit'
                    }}
                />
            </div>

            <button
                type="submit"
                disabled={isSubmitting}
                style={{
                    padding: 'var(--space-3)',
                    backgroundColor: 'var(--color-black)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    opacity: isSubmitting ? 0.7 : 1
                }}
            >
                {isSubmitting ? 'Saving...' : submitLabel}
            </button>
        </form>
    );
}
