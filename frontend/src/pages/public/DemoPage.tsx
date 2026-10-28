import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './DemoPage.css';

type DemoState = 'INTRO' | 'BUYER_CHECKOUT' | 'PENDING_15S' | 'SUCCESS';

export function DemoPage() {
    const [step, setStep] = useState<DemoState>('INTRO');
    const [timer, setTimer] = useState(15);
    const [showWhatsapp, setShowWhatsapp] = useState(false);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (step === 'PENDING_15S') {
            setTimer(15);
            interval = setInterval(() => {
                setTimer((prev) => {
                    if (prev <= 1) {
                        clearInterval(interval);
                        setStep('SUCCESS');
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [step]);

    useEffect(() => {
        if (step === 'SUCCESS') {
            setTimeout(() => setShowWhatsapp(true), 500); // slight delay for WhatsApp drop-down
        }
    }, [step]);

    // ==========================================
    // BUYER PHONE SCREEN (LEFT PANE)
    // ==========================================
    const renderBuyerScreen = () => {
        if (step === 'INTRO') {
            return (
                <div style={{ padding: '2rem 1rem', textAlign: 'center', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Your Buyer's Checkout</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                        This is what your customers see when they click your Tanna link on Instagram or WhatsApp.
                    </p>
                    <button
                        onClick={() => setStep('BUYER_CHECKOUT')}
                        style={{ padding: '0.75rem 1rem', background: 'var(--color-black)', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 600, width: '100%' }}
                    >
                        Start Simulation
                    </button>
                </div>
            );
        }

        if (step === 'BUYER_CHECKOUT') {
            return (
                <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <header style={{ textAlign: 'center', borderBottom: '1px dashed var(--border-subtle)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                        <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Femi's Kicks</h3>
                    </header>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                        <h1 style={{ fontSize: '1.25rem', fontWeight: 500, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Air Force 1 (White)</h1>
                        <div className="tabular-nums" style={{ fontSize: '2.5rem', fontWeight: 600 }}>₦ 80,000</div>

                        <div style={{ borderTop: '1px dashed var(--border-subtle)', margin: '1.5rem 0' }}></div>

                        <div style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Full Name</div>
                            <div style={{ padding: '0.75rem', border: '1px solid var(--border-subtle)', borderRadius: '4px', background: '#f8fafc', marginBottom: '1rem' }}>Tunde Adebayo</div>

                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Phone/WhatsApp Number</div>
                            <div style={{ padding: '0.75rem', border: '1px solid var(--border-subtle)', borderRadius: '4px', background: '#f8fafc' }}>0801 234 5678</div>
                        </div>
                    </div>

                    <button
                        onClick={() => setStep('PENDING_15S')}
                        style={{ width: '100%', padding: '1rem', background: 'var(--color-black)', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 600 }}
                    >
                        Simulate Payment (₦ 80,000)
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: 'var(--text-secondary)', marginTop: '1rem', fontSize: '0.7rem' }}>
                        🔒 Secured via Paystack / CBN Licensed Partners
                    </div>
                </div>
            );
        }

        if (step === 'PENDING_15S') {
            return (
                <div style={{ padding: '2rem 1.5rem', textAlign: 'center', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{
                        width: '48px', height: '48px', borderRadius: '50%', margin: '0 auto 1.5rem',
                        border: '3px solid var(--color-gray-200)', borderTopColor: 'var(--color-black)',
                        animation: 'spin 1s linear infinite'
                    }} />
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Verifying Payment</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '2rem' }}>Awaiting confirmation...</p>

                    <div style={{
                        background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '4px', padding: '1rem',
                        fontSize: '0.85rem', color: '#92400e', textAlign: 'left', lineHeight: 1.5
                    }}>
                        <strong>Note:</strong> Real bank transfers take time. We intentionally wait 15 seconds here to simulate realistic NIP settlement delays. Do not panic, your money is safe.
                    </div>
                </div>
            );
        }

        if (step === 'SUCCESS') {
            return (
                <div style={{ padding: '2rem 1.5rem', textAlign: 'center', height: '100%', overflowY: 'auto' }}>
                    <div style={{ background: '#dcfce7', color: '#166534', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', margin: '0 auto 1rem' }}>✓</div>
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Payment Verified</h2>

                    <div className="tabular-nums" style={{ fontSize: '2.5rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1, marginBottom: '2rem' }}>
                        ₦ 80,000
                    </div>

                    <div style={{ borderTop: '1px dashed var(--border-subtle)', margin: '1.5rem 0' }}></div>

                    <div style={{ textAlign: 'left', fontSize: '0.9rem', marginBottom: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Status</span>
                            <span style={{ fontWeight: 600, color: '#166534' }}>Successful</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Item</span>
                            <span>Air Force 1 (White)</span>
                        </div>
                    </div>

                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Verified by <strong>Tanna</strong>. Immutable record.
                    </div>
                </div>
            );
        }
    };

    // ==========================================
    // SELLER DASHBOARD SCREEN (RIGHT PANE)
    // ==========================================
    const renderSellerScreen = () => {
        return (
            <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2rem' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Tanna Dashboard</h2>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Total Revenue</div>
                        <div className="tabular-nums" style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                            {step === 'SUCCESS' ? '₦ 1,280,000' : '₦ 1,200,000'}
                        </div>
                    </div>
                </div>

                <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '4px', padding: '1.5rem' }}>
                    <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Recent Orders</h3>

                    {/* The actively simulating order */}
                    <div style={{
                        border: '1px solid var(--border-subtle)', borderRadius: '4px', padding: '1rem',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem',
                        backgroundColor: step === 'SUCCESS' ? '#f0fdf4' : 'white',
                        transition: 'background-color 0.5s ease'
                    }}>
                        <div>
                            <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Air Force 1 (White)</div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Tunde · ₦ 80,000</div>
                        </div>
                        <div>
                            {step === 'INTRO' || step === 'BUYER_CHECKOUT' ? (
                                <span style={{ background: '#f1f5f9', color: '#64748b', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>AWAITING BUYER</span>
                            ) : step === 'PENDING_15S' ? (
                                <span style={{ background: '#fff7e6', color: '#d46b08', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>VERIFYING TRANSFER... ({timer}s)</span>
                            ) : (
                                <span style={{ background: '#dcfce7', color: '#166534', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>PAID (CONFIRMED)</span>
                            )}
                        </div>
                    </div>

                    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '4px', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>G-Shock Watch</div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Amaka · ₦ 35,000</div>
                        </div>
                        <div>
                            <span style={{ background: '#dcfce7', color: '#166534', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>PAID</span>
                        </div>
                    </div>
                </div>

                {/* Simulated WhatsApp Notification */}
                <div className={`toast ${showWhatsapp ? 'visible' : ''}`}>
                    <div style={{ background: '#25D366', width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                        {/* Simple WhatsApp icon placeholder */}
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.15rem' }}>WhatsApp</div>
                        <div style={{ fontSize: '0.9rem' }}><strong>Tanna:</strong> ₦80,000 received for Order #9142. Buyer: Tunde Adebayo.</div>
                    </div>
                </div>

            </div>
        );
    };

    return (
        <div style={{ position: 'relative', minHeight: '100vh', background: 'var(--color-gray-50)' }}>
            {/* Header / Nav */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '1.5rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
                <Link to="/" style={{ fontWeight: 600, fontSize: '1.25rem', color: 'var(--color-black)' }}>Tanna</Link>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    Simulation Mode
                </div>
                <Link to="/" style={{ fontSize: '0.9rem', color: 'var(--color-black)', border: '1px solid var(--border-subtle)', padding: '0.5rem 1rem', borderRadius: '4px', background: 'white' }}>
                    Close Simulation
                </Link>
            </div>

            <div className="demo-container" style={{ paddingTop: '60px' }}>
                {/* The Buyer's Experience */}
                <div className="demo-buyer-pane">
                    <div className="phone-frame">
                        {renderBuyerScreen()}
                    </div>
                </div>

                {/* The Seller Dashboard Updates */}
                <div className="demo-seller-pane">
                    {renderSellerScreen()}
                </div>
            </div>
        </div>
    );
}
