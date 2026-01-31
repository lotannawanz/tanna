import { Link, Outlet, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export function VendorLayout() {
    const { vendorId } = useParams();
    const { vendor, logout } = useAuth();

    // Use vendor store name if available, fallback to generic
    const storeName = vendor?.store?.name || 'Vendor Portal';

    return (
        <div style={{
            maxWidth: '800px',
            margin: '0 auto',
            padding: 'var(--space-4)',
            fontFamily: 'Inter, system-ui, sans-serif'
        }}>
            <header style={{
                marginBottom: 'var(--space-6)',
                borderBottom: '1px solid #eee',
                paddingBottom: 'var(--space-4)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div>
                    <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{storeName}</h1>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        Manage your orders
                    </p>
                </div>
                {vendorId && (
                    <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
                        <Link
                            to={`/vendor/${vendorId}/dashboard`}
                            style={{ fontSize: '0.875rem', textDecoration: 'none', color: 'var(--text-primary)', fontWeight: 500 }}
                        >
                            Dashboard
                        </Link>
                        <Link
                            to={`/vendor/${vendorId}/products`}
                            style={{ fontSize: '0.875rem', textDecoration: 'none', color: 'var(--text-primary)', fontWeight: 500 }}
                        >
                            Products
                        </Link>
                        <Link
                            to={`/vendor/${vendorId}/settings`}
                            style={{ fontSize: '0.875rem', textDecoration: 'none', color: 'var(--text-primary)', fontWeight: 500 }}
                        >
                            Settings
                        </Link>
                        <button
                            onClick={logout}
                            style={{
                                fontSize: '0.875rem',
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                padding: 0
                            }}
                        >
                            Logout
                        </button>
                    </div>
                )}
            </header>

            <main>
                <Outlet />
            </main>
        </div>
    );
}
