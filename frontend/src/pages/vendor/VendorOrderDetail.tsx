import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

interface OrderItem {
    id: string;
    productId: string;
    productName: string;
    unitPriceKobo: number;
    quantity: number;
    subtotalKobo: number;
}

interface OrderDetail {
    id: string;
    status: string;
    buyerPhone: string;
    buyerEmail: string | null;
    totalAmountKobo: number;
    createdAt: string;
    confirmedAt: string | null;
    fulfilledAt: string | null;
    items: OrderItem[];
    payment: {
        internalRef: string;
        paystackRef: string | null;
    } | null;
}

export function VendorOrderDetail() {
    const { vendorId, orderId } = useParams();
    const { vendor } = useAuth();
    const navigate = useNavigate();

    const [order, setOrder] = useState<OrderDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [fulfilling, setFulfilling] = useState(false);

    // Use authenticated vendor's ID, fallback to URL param
    const effectiveVendorId = vendor?.id || vendorId;

    useEffect(() => {
        if (!effectiveVendorId || !orderId) return;

        const fetchOrder = async () => {
            try {
                const response = await api.get(`/api/vendors/${effectiveVendorId}/orders/${orderId}`);
                setOrder(response.data.order);
            } catch (err: any) {
                setError(err.response?.data?.message || err.message || 'Failed to fetch order details');
            } finally {
                setLoading(false);
            }
        };

        fetchOrder();
    }, [effectiveVendorId, orderId]);

    const handleFulfill = async () => {
        if (!effectiveVendorId || !orderId) return;
        if (!confirm('Mark this order as fulfilled? This cannot be undone.')) return;

        setFulfilling(true);
        try {
            await api.post(`/api/vendors/${effectiveVendorId}/orders/${orderId}/fulfill`);

            // Refresh order data
            const refreshResponse = await api.get(`/api/vendors/${effectiveVendorId}/orders/${orderId}`);
            setOrder(refreshResponse.data.order);
            alert('Order marked as fulfilled!');
        } catch (err: any) {
            alert(err.response?.data?.message || err.message || 'Failed to fulfill order');
        } finally {
            setFulfilling(false);
        }
    };

    if (loading) return <div>Loading details...</div>;
    if (error) return <div style={{ color: 'red' }}>Error: {error}</div>;
    if (!order) return <div>Order not found</div>;

    const isConfirmed = order.status === 'CONFIRMED';
    const isFulfilled = order.status === 'FULFILLED';

    return (
        <div>
            <button
                onClick={() => navigate(-1)}
                style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    marginBottom: 'var(--space-4)',
                    padding: 0
                }}
            >
                ← Back to Dashboard
            </button>

            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'start',
                marginBottom: 'var(--space-6)'
            }}>
                <div>
                    <h2 style={{
                        fontSize: '1.25rem',
                        fontWeight: 600,
                        marginBottom: 'var(--space-1)'
                    }}>Order Details</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                        {order.id}
                    </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{
                        fontSize: '0.875rem',
                        color: 'var(--text-secondary)',
                        marginBottom: 'var(--space-1)'
                    }}>
                        Placed on {new Date(order.createdAt).toLocaleDateString()}
                    </div>
                    <div style={{ fontWeight: 600, color: isFulfilled ? '#096dd9' : isConfirmed ? '#389e0d' : '#888' }}>
                        {order.status}
                    </div>
                </div>
            </div>

            <div style={{
                display: 'grid',
                gap: 'var(--space-6)',
                marginBottom: 'var(--space-8)'
            }}>
                <section>
                    <h3 style={{
                        fontSize: '0.875rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: 'var(--text-secondary)',
                        marginBottom: 'var(--space-3)'
                    }}>
                        Items
                    </h3>
                    <div style={{
                        border: '1px solid #eee',
                        borderRadius: '8px',
                        overflow: 'hidden'
                    }}>
                        {order.items.map((item, i) => (
                            <div key={item.id} style={{
                                padding: 'var(--space-3)',
                                borderBottom: i < order.items.length - 1 ? '1px solid #eee' : 'none',
                                display: 'flex',
                                justifyContent: 'space-between'
                            }}>
                                <div>
                                    <div style={{ fontWeight: 500 }}>
                                        <Link
                                            to={`/vendor/${effectiveVendorId}/products/${item.productId}/edit`}
                                            style={{ color: 'inherit', textDecoration: 'none' }}
                                            onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                                            onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                                        >
                                            {item.productName}
                                        </Link>
                                    </div>
                                    <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                        {item.quantity} × {(item.unitPriceKobo / 100).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                                    </div>
                                </div>
                                <div style={{ fontWeight: 500 }}>
                                    {(item.subtotalKobo / 100).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                                </div>
                            </div>
                        ))}
                        <div style={{
                            padding: 'var(--space-3)',
                            backgroundColor: '#f9fafb',
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontWeight: 600
                        }}>
                            <span>Total</span>
                            <span>{(order.totalAmountKobo / 100).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</span>
                        </div>
                    </div>
                </section>

                <section>
                    <h3 style={{
                        fontSize: '0.875rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: 'var(--text-secondary)',
                        marginBottom: 'var(--space-3)'
                    }}>
                        Payment & Customer
                    </h3>
                    <div style={{
                        border: '1px solid #eee',
                        borderRadius: '8px',
                        padding: 'var(--space-4)'
                    }}>
                        <div style={{ marginBottom: 'var(--space-3)' }}>
                            <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>Customer</span>
                            <a href={`tel:${order.buyerPhone}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 500, marginRight: '12px' }}>{order.buyerPhone}</a>
                            {order.buyerEmail && (
                                <a href={`mailto:${order.buyerEmail}`} style={{ color: 'inherit', textDecoration: 'none', fontSize: '0.9rem' }}>{order.buyerEmail}</a>
                            )}
                        </div>

                        {order.payment && (
                            <div style={{ borderTop: '1px solid #eee', paddingTop: 'var(--space-3)' }}>
                                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>Payment Reference</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <code style={{ background: '#f5f5f5', padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem' }}>
                                        {order.payment.paystackRef || order.payment.internalRef}
                                    </code>
                                    <button
                                        onClick={() => {
                                            const ref = order.payment?.paystackRef || order.payment?.internalRef;
                                            if (ref) {
                                                navigator.clipboard.writeText(ref);
                                                alert('Copied');
                                            }
                                        }}
                                        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.9rem' }}
                                        title="Copy reference"
                                    >
                                        📋
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </section>
            </div>

            {/* Actions */}
            {isConfirmed && (
                <div style={{
                    position: 'sticky',
                    bottom: 'var(--space-4)',
                    backgroundColor: 'white',
                    padding: 'var(--space-4)',
                    boxShadow: '0 -4px 12px rgba(0,0,0,0.05)',
                    borderRadius: '8px',
                    border: '1px solid #eee',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <div>
                        <div style={{ fontWeight: 600 }}>Ready to ship?</div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                            Mark as fulfilled when handed to delivery.
                        </div>
                    </div>
                    <button
                        onClick={handleFulfill}
                        disabled={fulfilling}
                        style={{
                            backgroundColor: '#000',
                            color: '#fff',
                            border: 'none',
                            padding: '10px 20px',
                            borderRadius: '6px',
                            fontWeight: 600,
                            cursor: fulfilling ? 'wait' : 'pointer',
                            opacity: fulfilling ? 0.7 : 1
                        }}
                    >
                        {fulfilling ? 'Updating...' : 'Mark as Fulfilled'}
                    </button>
                </div>
            )}
        </div>
    );
}
