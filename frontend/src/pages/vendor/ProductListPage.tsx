import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

interface Product {
    id: string;
    name: string;
    slug: string;
    price: number;
    currency: string;
    status: 'ACTIVE' | 'PAUSED';
    createdAt: string;
}

export function ProductListPage() {
    const { vendorId } = useParams();
    const { vendor } = useAuth();
    const navigate = useNavigate();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Use authenticated vendor's ID
    const effectiveVendorId = vendor?.id || vendorId;
    const storeSlug = vendor?.store?.slug;

    useEffect(() => {
        if (!effectiveVendorId) return;

        const fetchProducts = async () => {
            try {
                const response = await api.get('/api/products');
                setProducts(response.data.products);
            } catch (err: any) {
                setError(err.response?.data?.message || err.message || 'Failed to fetch products');
            } finally {
                setLoading(false);
            }
        };

        fetchProducts();
    }, [effectiveVendorId]);

    const handleCopyLink = (productSlug: string) => {
        if (!storeSlug) {
            alert('Store slug not found. Ensure you have a store created.');
            return;
        }

        // Construct public URL
        const url = `${window.location.origin}/store/${storeSlug}/product/${productSlug}`;

        navigator.clipboard.writeText(url).then(() => {
            alert('Product link copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy', err);
        });
    };

    const toggleStatus = async (productId: string, currentStatus: string) => {
        const newStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';

        if (newStatus === 'PAUSED') {
            if (!confirm('Are you sure you want to pause this product? It will be hidden from your store and customers cannot buy it.')) {
                return;
            }
        }

        try {
            // Optimistic update
            setProducts(products.map(p =>
                p.id === productId ? { ...p, status: newStatus } : p
            ));

            await api.patch(`/api/products/${productId}/status`, {
                status: newStatus
            });
        } catch (err) {
            console.error('Failed to update status', err);
            // Revert on error
            setProducts(products.map(p =>
                p.id === productId ? { ...p, status: currentStatus as 'ACTIVE' | 'PAUSED' } : p
            ));
            alert('Failed to update product status');
        }
    };

    if (loading) return <div>Loading products...</div>;
    if (error) return <div style={{ color: 'red' }}>Error: {error}</div>;

    return (
        <div>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--space-6)'
            }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>Products</h2>
                <Link
                    to="new"
                    style={{
                        padding: 'var(--space-2) var(--space-4)',
                        backgroundColor: 'var(--color-black)',
                        color: 'white',
                        textDecoration: 'none',
                        borderRadius: '6px',
                        fontWeight: 500,
                        fontSize: '0.875rem'
                    }}
                >
                    + Add Product
                </Link>
            </div>

            {products.length === 0 ? (
                <div style={{
                    textAlign: 'center',
                    padding: 'var(--space-8)',
                    backgroundColor: '#F0F9FF',
                    border: '1px solid #BAE6FD',
                    borderRadius: '8px',
                    color: '#0369A1'
                }}>
                    <h3 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-2)' }}>Start Selling</h3>
                    <p style={{ marginBottom: 'var(--space-6)', color: '#0C4A6E' }}>
                        You haven't added any products yet. Create your first product to start accepting orders.
                    </p>
                    <Link
                        to="new"
                        style={{
                            display: 'inline-block',
                            padding: 'var(--space-3) var(--space-6)',
                            backgroundColor: '#0284C7',
                            color: 'white',
                            fontWeight: 600,
                            textDecoration: 'none',
                            borderRadius: '6px'
                        }}
                    >
                        Create Product
                    </Link>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {products.map(product => (
                        <div
                            key={product.id}
                            style={{
                                border: '1px solid #eee',
                                borderRadius: '8px',
                                padding: 'var(--space-4)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                backgroundColor: product.status === 'PAUSED' ? '#fafafa' : 'white'
                            }}
                        >
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
                                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: product.status === 'PAUSED' ? 'var(--text-secondary)' : 'inherit' }}>
                                        {product.name}
                                    </h3>
                                    <StatusBadge status={product.status} />
                                </div>
                                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                    {(product.price / 100).toLocaleString('en-NG', { style: 'currency', currency: product.currency })}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                                <button
                                    onClick={() => {
                                        if (storeSlug) {
                                            window.open(`/store/${storeSlug}/product/${product.slug}`, '_blank');
                                        }
                                    }}
                                    title="View Live Page"
                                    style={{
                                        padding: 'var(--space-2)',
                                        background: 'white',
                                        border: '1px solid #ddd',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '0.875rem',
                                        color: '#666'
                                    }}
                                >
                                    👀
                                </button>
                                <button
                                    onClick={() => handleCopyLink(product.slug)}
                                    title="Copy Link"
                                    style={{
                                        padding: 'var(--space-2)',
                                        background: 'white',
                                        border: '1px solid #ddd',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '0.875rem',
                                        color: '#666'
                                    }}
                                >
                                    🔗
                                </button>
                                <button
                                    onClick={() => navigate(`${product.id}/edit`)}
                                    style={{
                                        padding: 'var(--space-2) var(--space-3)',
                                        background: 'white',
                                        border: '1px solid #ddd',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '0.875rem'
                                    }}
                                >
                                    Edit
                                </button>
                                <button
                                    onClick={() => toggleStatus(product.id, product.status)}
                                    style={{
                                        padding: 'var(--space-2) var(--space-3)',
                                        background: product.status === 'ACTIVE' ? '#fff1f0' : '#f6ffed',
                                        border: `1px solid ${product.status === 'ACTIVE' ? '#ffa39e' : '#b7eb8f'}`,
                                        color: product.status === 'ACTIVE' ? '#cf1322' : '#389e0d',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '0.875rem',
                                        minWidth: '70px'
                                    }}
                                >
                                    {product.status === 'ACTIVE' ? 'Pause' : 'Activate'}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const isActive = status === 'ACTIVE';
    return (
        <span style={{
            fontSize: '0.75rem',
            padding: '2px 6px',
            borderRadius: '4px',
            backgroundColor: isActive ? '#f6ffed' : '#fff1f0',
            color: isActive ? '#389e0d' : '#cf1322',
            border: `1px solid ${isActive ? '#b7eb8f' : '#ffa39e'}`,
            fontWeight: 500
        }}>
            {status}
        </span>
    );
}
