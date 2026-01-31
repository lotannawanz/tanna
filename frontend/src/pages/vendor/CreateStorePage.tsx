import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export function CreateStorePage() {
    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');
    const [deliveryEstimate, setDeliveryEstimate] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();
    const { refreshVendor, vendor } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            await api.post('/api/store', {
                name,
                slug,
                deliveryEstimateText: deliveryEstimate || undefined,
            });

            await refreshVendor();

            // We need the updated vendor object to get the ID for redirection
            // If refreshVendor updated the state, we might need to wait or check local state
            // But we can assume the ID didn't change, just the store presence

            const vendorId = vendor?.id;
            if (vendorId) {
                navigate(`/vendor/${vendorId}/dashboard`);
            } else {
                // Fallback, shouldn't happen if auth is working
                navigate('/');
            }

        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to create store');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div>
            <h2 style={{ marginBottom: 'var(--space-4)', fontSize: '1.25rem' }}>Open Your Store</h2>

            {error && (
                <div style={{ color: 'red', marginBottom: 'var(--space-3)' }}>
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div>
                    <input
                        type="text"
                        placeholder="Store Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        style={{
                            width: '100%',
                            padding: 'var(--space-3)',
                            borderRadius: '6px',
                            border: '1px solid var(--border-subtle)'
                        }}
                    />
                </div>

                <div>
                    <input
                        type="text"
                        placeholder="Store URL Slug (e.g. my-store)"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        required
                        pattern="^[a-z0-9-]+$"
                        title="Lowercase letters, numbers, and hyphens only"
                        style={{
                            width: '100%',
                            padding: 'var(--space-3)',
                            borderRadius: '6px',
                            border: '1px solid var(--border-subtle)'
                        }}
                    />
                    <small style={{ color: 'var(--text-secondary)', display: 'block', marginTop: '4px' }}>
                        tanna.com/store/{slug || 'your-slug'}
                    </small>
                </div>

                <div>
                    <input
                        type="text"
                        placeholder="Delivery Estimate (e.g. 24-48 hours)"
                        value={deliveryEstimate}
                        onChange={(e) => setDeliveryEstimate(e.target.value)}
                        style={{
                            width: '100%',
                            padding: 'var(--space-3)',
                            borderRadius: '6px',
                            border: '1px solid var(--border-subtle)'
                        }}
                    />
                </div>

                <button
                    type="submit"
                    disabled={isLoading}
                    style={{
                        padding: 'var(--space-3)',
                        backgroundColor: 'var(--color-black)',
                        color: 'white',
                        borderRadius: '6px',
                        border: 'none',
                        opacity: isLoading ? 0.7 : 1
                    }}
                >
                    {isLoading ? 'Creating Store...' : 'Launch Store'}
                </button>
            </form>
        </div>
    );
}
