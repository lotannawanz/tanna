import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

interface StoreSettings {
    name: string;
    slug: string;
    status: 'ACTIVE' | 'PAUSED';
    currency: string;
    deliveryEstimateText?: string;
}

export function VendorSettingsPage() {
    const { vendorId } = useParams();
    const { vendor, refreshVendor } = useAuth();
    const [store, setStore] = useState<StoreSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    // Form state
    const [name, setName] = useState('');
    const [deliveryEstimate, setDeliveryEstimate] = useState('');

    useEffect(() => {
        const fetchStore = async () => {
            try {
                const response = await api.get('/api/store');
                const storeData = response.data.store;
                setStore(storeData);
                setName(storeData.name);
                setDeliveryEstimate(storeData.deliveryEstimateText || '');
            } catch (err: any) {
                setError(err.response?.data?.message || 'Failed to fetch store settings');
            } finally {
                setLoading(false);
            }
        };

        fetchStore();
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        setSuccessMsg(null);

        try {
            await api.patch('/api/store', {
                name,
                deliveryEstimateText: deliveryEstimate
            });
            setSuccessMsg('Settings saved successfully');
            refreshVendor(); // Update context
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to update settings');
        } finally {
            setSaving(false);
        }
    };

    const toggleStoreStatus = async () => {
        if (!store) return;

        const newStatus = store.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
        const action = newStatus === 'ACTIVE' ? 'activate' : 'pause';

        if (newStatus === 'PAUSED') {
            if (!confirm('Are you sure you want to pause your store? Customers will not be able to place new orders.')) {
                return;
            }
        }

        try {
            setSaving(true);
            const response = await api.patch('/api/store', {
                status: newStatus
            });
            setStore(response.data.store);
            setSuccessMsg(`Store ${action}d successfully`);
            refreshVendor();
        } catch (err: any) {
            setError(err.response?.data?.message || `Failed to ${action} store`);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div>Loading settings...</div>;

    return (
        <div style={{ maxWidth: '600px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: 'var(--space-6)' }}>Store Settings</h2>

            {error && (
                <div style={{
                    padding: 'var(--space-3)',
                    backgroundColor: '#fff1f0',
                    color: '#cf1322',
                    borderRadius: '6px',
                    marginBottom: 'var(--space-4)'
                }}>
                    {error}
                </div>
            )}

            {successMsg && (
                <div style={{
                    padding: 'var(--space-3)',
                    backgroundColor: '#f6ffed',
                    color: '#389e0d',
                    borderRadius: '6px',
                    marginBottom: 'var(--space-4)'
                }}>
                    {successMsg}
                </div>
            )}

            {/* General Settings Form */}
            <form onSubmit={handleSave} style={{ marginBottom: 'var(--space-8)' }}>
                <div style={{ marginBottom: 'var(--space-4)' }}>
                    <label style={{ display: 'block', marginBottom: 'var(--space-1)', fontWeight: 500 }}>
                        Store Name
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        style={{
                            width: '100%',
                            padding: 'var(--space-3)',
                            borderRadius: '6px',
                            border: '1px solid #d9d9d9',
                            fontSize: '1rem'
                        }}
                    />
                </div>

                <div style={{ marginBottom: 'var(--space-6)' }}>
                    <label style={{ display: 'block', marginBottom: 'var(--space-1)', fontWeight: 500 }}>
                        Delivery Estimate Text
                    </label>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-1)' }}>
                        Shown to customers at checkout. E.g. "Delivered within 24 hours"
                    </p>
                    <input
                        type="text"
                        value={deliveryEstimate}
                        onChange={(e) => setDeliveryEstimate(e.target.value)}
                        placeholder="e.g. Instant delivery"
                        style={{
                            width: '100%',
                            padding: 'var(--space-3)',
                            borderRadius: '6px',
                            border: '1px solid #d9d9d9',
                            fontSize: '1rem'
                        }}
                    />
                </div>

                <button
                    type="submit"
                    disabled={saving}
                    style={{
                        padding: 'var(--space-3) var(--space-6)',
                        backgroundColor: 'var(--color-black)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 600,
                        cursor: saving ? 'not-allowed' : 'pointer',
                        opacity: saving ? 0.7 : 1
                    }}
                >
                    {saving ? 'Saving...' : 'Save Changes'}
                </button>
            </form>

            <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: 'var(--space-8) 0' }} />

            {/* Store Status Section */}
            <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
                    Store Status
                </h3>
                <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
                    When paused, your public store page will show a "Temporarily Unavailable" message and customers cannot buy products.
                </p>

                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--space-4)',
                    backgroundColor: store?.status === 'ACTIVE' ? '#f6ffed' : '#fff1f0',
                    border: `1px solid ${store?.status === 'ACTIVE' ? '#b7eb8f' : '#ffa39e'}`,
                    borderRadius: '8px'
                }}>
                    <div>
                        <div style={{ fontWeight: 600, color: store?.status === 'ACTIVE' ? '#389e0d' : '#cf1322' }}>
                            Currently {store?.status === 'ACTIVE' ? 'Active' : 'Paused'}
                        </div>
                    </div>
                    <button
                        onClick={toggleStoreStatus}
                        type="button"
                        style={{
                            padding: 'var(--space-2) var(--space-4)',
                            backgroundColor: 'white',
                            border: '1px solid #d9d9d9',
                            borderRadius: '6px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            color: store?.status === 'ACTIVE' ? '#cf1322' : '#389e0d',
                            borderColor: store?.status === 'ACTIVE' ? '#ffa39e' : '#b7eb8f'
                        }}
                    >
                        {store?.status === 'ACTIVE' ? 'Pause Store' : 'Activate Store'}
                    </button>
                </div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: 'var(--space-8) 0' }} />

            {/* Info Section */}
            <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 'var(--space-4)' }}>
                    Store Information
                </h3>

                <div style={{ marginBottom: 'var(--space-4)' }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        Public Store URL
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
                        <code style={{
                            backgroundColor: '#f5f5f5',
                            padding: 'var(--space-2)',
                            borderRadius: '4px',
                            display: 'block',
                            width: '100%',
                            fontFamily: 'monospace'
                        }}>
                            {window.location.origin}/store/{store?.slug}
                        </code>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}/store/${store?.slug}`);
                                alert('Copied!');
                            }}
                            style={{
                                padding: 'var(--space-2)',
                                border: '1px solid #d9d9d9',
                                borderRadius: '4px',
                                background: 'white',
                                cursor: 'pointer'
                            }}
                        >
                            Copy
                        </button>
                    </div>
                </div>

                <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        WhatsApp Number
                    </div>
                    <div style={{ marginTop: 'var(--space-1)' }}>
                        {vendor?.phone || 'Not set'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 'var(--space-1)' }}>
                        Used for order notifications. Contact support to change.
                    </div>
                </div>
            </div>
        </div>
    );
}
