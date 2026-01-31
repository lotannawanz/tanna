import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

interface OrderSummary {
    id: string;
    status: string;
    buyerPhone: string;
    totalAmountKobo: number;
    itemCount: number;
    createdAt: string;
    paymentRef: string | null;
    items?: { productName: string }[];
}

interface StoreOverview {
    store: {
        id: string;
        name: string;
        slug: string;
        status: 'ACTIVE' | 'PAUSED';
        currency: string;
    };
    stats: {
        totalOrders: number;
        ordersToday: number;
        totalRevenueKobo: number;
        productCount: number;
    };
}

export function VendorDashboard() {
    const { vendorId } = useParams();
    const { vendor } = useAuth();
    const [orders, setOrders] = useState<OrderSummary[]>([]);
    const [overview, setOverview] = useState<StoreOverview | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Use authenticated vendor's ID
    const effectiveVendorId = vendor?.id || vendorId;

    useEffect(() => {
        if (!effectiveVendorId) return;

        const fetchData = async () => {
            try {
                // Fetch overview and orders in parallel
                const [overviewRes, ordersRes] = await Promise.all([
                    api.get('/api/vendor/store/overview').catch(e => {
                        console.error("Failed to fetch overview", e);
                        return { data: null };
                    }),
                    api.get(`/api/vendors/${effectiveVendorId}/orders?limit=50`)
                ]);

                if (overviewRes.data) {
                    setOverview(overviewRes.data);
                }
                setOrders(ordersRes.data.orders);
            } catch (err: any) {
                setError(err.response?.data?.message || err.message || 'Failed to fetch dashboard data');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [effectiveVendorId]);

    if (loading) return <div>Loading dashboard...</div>;
    if (error) return <div style={{ color: 'red' }}>Error: {error}</div>;

    // Group orders by date
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const ordersToday = orders.filter(o => new Date(o.createdAt) >= today);
    const ordersOlder = orders.filter(o => new Date(o.createdAt) < today);

    const hasOrders = orders.length > 0;
    const hasProducts = overview?.stats.productCount && overview.stats.productCount > 0;

    return (
        <div>
            {/* Store Overview Section */}
            {overview && (
                <div style={{ marginBottom: 'var(--space-8)' }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        marginBottom: 'var(--space-4)'
                    }}>
                        <div>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                                {overview.store.name}
                            </h2>
                            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                                    /store/{overview.store.slug}
                                </span>
                                {overview.store.status === 'PAUSED' && (
                                    <span style={{
                                        backgroundColor: '#fff1f0',
                                        color: '#cf1322',
                                        border: '1px solid #ffa39e',
                                        fontSize: '0.75rem',
                                        padding: '2px 8px',
                                        borderRadius: '12px',
                                        fontWeight: 600
                                    }}>
                                        PAUSED
                                    </span>
                                )}
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{
                                fontSize: '0.875rem',
                                color: 'var(--text-secondary)',
                                marginBottom: 'var(--space-1)'
                            }}>
                                Total Revenue
                            </div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                                {(overview.stats.totalRevenueKobo / 100).toLocaleString('en-NG', {
                                    style: 'currency',
                                    currency: overview.store.currency
                                })}
                            </div>
                        </div>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 'var(--space-4)'
                    }}>
                        <div style={{
                            padding: 'var(--space-4)',
                            backgroundColor: 'white',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px'
                        }}>
                            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
                                Orders Today
                            </div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                                {overview.stats.ordersToday}
                            </div>
                        </div>
                        <div style={{
                            padding: 'var(--space-4)',
                            backgroundColor: 'white',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px'
                        }}>
                            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
                                Total Orders
                            </div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                                {overview.stats.totalOrders}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Empty States that Teach */}
            {!hasProducts && (
                <div style={{
                    padding: 'var(--space-6)',
                    backgroundColor: '#F0F9FF',
                    border: '1px solid #BAE6FD',
                    borderRadius: '8px',
                    marginBottom: 'var(--space-8)',
                    textAlign: 'center'
                }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 'var(--space-2)', color: '#0369A1' }}>
                        Start Selling
                    </h3>
                    <p style={{ color: '#0C4A6E', marginBottom: 'var(--space-4)' }}>
                        You haven't added any products yet. Create your first product to start accepting orders.
                    </p>
                    <Link to={`/vendor/${effectiveVendorId}/products/new`} style={{
                        display: 'inline-block',
                        padding: 'var(--space-2) var(--space-4)',
                        backgroundColor: '#0284C7',
                        color: 'white',
                        fontWeight: 600,
                        borderRadius: '6px',
                        textDecoration: 'none'
                    }}>
                        Create Product
                    </Link>
                </div>
            )}

            {hasProducts && !hasOrders && (
                <div style={{
                    padding: 'var(--space-6)',
                    backgroundColor: '#F0FDF4',
                    border: '1px solid #BBF7D0',
                    borderRadius: '8px',
                    marginBottom: 'var(--space-8)',
                    textAlign: 'center'
                }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 'var(--space-2)', color: '#15803D' }}>
                        Ready for Orders
                    </h3>
                    <p style={{ color: '#14532D', marginBottom: 'var(--space-4)' }}>
                        Share your store link on WhatsApp to get your first order.
                    </p>
                    <button
                        onClick={() => {
                            if (overview) {
                                navigator.clipboard.writeText(`${window.location.origin}/store/${overview.store.slug}`);
                                alert('Store link copied!');
                            }
                        }}
                        style={{
                            padding: 'var(--space-2) var(--space-4)',
                            backgroundColor: '#16A34A',
                            color: 'white',
                            fontWeight: 600,
                            borderRadius: '6px',
                            border: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        Copy Store Link
                    </button>
                </div>
            )}

            {/* Orders List */}
            <div>
                <h3 style={{
                    fontSize: '1.1rem',
                    fontWeight: 600,
                    marginBottom: 'var(--space-4)',
                    color: 'var(--text-secondary)'
                }}>
                    Recent Orders
                </h3>

                {orders.length === 0 ? (
                    <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-secondary)', background: '#f8fafc', borderRadius: '8px' }}>
                        No orders yet.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                        {ordersToday.length > 0 && (
                            <div>
                                <h4 style={{
                                    fontSize: '0.875rem',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    color: 'var(--text-secondary)',
                                    marginBottom: 'var(--space-3)'
                                }}>Today</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                                    {ordersToday.map(order => <OrderCard key={order.id} order={order} vendorId={effectiveVendorId!} />)}
                                </div>
                            </div>
                        )}

                        {ordersOlder.length > 0 && (
                            <div>
                                <h4 style={{
                                    fontSize: '0.875rem',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    color: 'var(--text-secondary)',
                                    marginBottom: 'var(--space-3)'
                                }}>Previous</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                                    {ordersOlder.map(order => <OrderCard key={order.id} order={order} vendorId={effectiveVendorId!} />)}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function OrderCard({ order, vendorId }: { order: OrderSummary, vendorId: string }) {
    return (
        <Link
            to={`/vendor/${vendorId}/orders/${order.id}`}
            style={{
                display: 'block',
                padding: 'var(--space-4)',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                textDecoration: 'none',
                color: 'inherit',
                backgroundColor: 'white',
                transition: 'box-shadow 0.2s',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                <div style={{ fontWeight: 600 }}>
                    {(order.totalAmountKobo / 100).toLocaleString('en-NG', {
                        style: 'currency',
                        currency: 'NGN'
                    })}
                </div>
                <OrderStatusBadge status={order.status} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                <div>
                    {order.items && order.items.length > 0 ? order.items[0].productName : `${order.itemCount} items`}
                    {order.items && order.itemCount > 1 && ` +${order.itemCount - 1} more`}
                </div>
                <div>
                    {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
            </div>
        </Link>
    );
}

function OrderStatusBadge({ status }: { status: string }) {
    let bg = '#eee';
    let color = '#333';

    switch (status) {
        case 'CONFIRMED':
            bg = '#f6ffed';
            color = '#389e0d';
            break;
        case 'FULFILLED':
            bg = '#e6f7ff';
            color = '#096dd9';
            break;
        case 'CANCELLED':
        case 'REFUNDED':
        case 'FAILED':
            bg = '#fff1f0';
            color = '#cf1322';
            break;
        case 'AWAITING_PAYMENT':
            bg = '#fff7e6';
            color = '#d46b08';
            break;
    }

    return (
        <span style={{
            backgroundColor: bg,
            color: color,
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '0.75rem',
            fontWeight: 600,
        }}>
            {status.replace('_', ' ')}
        </span>
    );
}
