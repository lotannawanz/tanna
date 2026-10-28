import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import './PaymentVerify.css';

// ===================
// TYPES
// ===================

type PaymentStatus = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'DELAYED';

interface OrderItem {
    productName: string;
    productImage: string | null;
    quantity: number;
    unitPriceKobo: number;
}

interface OrderData {
    id: string;
    shortRef: string;
    status: string;
    totalAmountKobo: number;
    buyerPhone: string | null;
    createdAt: string;
    confirmedAt: string | null;
    items: OrderItem[];
}

interface StoreData {
    name: string;
    slug: string;
}

interface ReceiptData {
    payment: {
        status: PaymentStatus;
        amount: number;
        currency: string;
        createdAt: string;
        verifiedAt: string | null;
    };
    order: OrderData | null;
    store: StoreData | null;
}

// ===================
// COMPONENT
// ===================

export function PaymentVerify() {
    const [searchParams] = useSearchParams();
    const reference = searchParams.get('reference') || searchParams.get('trxref');

    const [status, setStatus] = useState<PaymentStatus>('PENDING');
    const [error, setError] = useState<string | null>(null);
    const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
    const [pollCount, setPollCount] = useState(0);

    useEffect(() => {
        if (!reference) {
            setError('No payment reference provided');
            setStatus('FAILED');
            return;
        }

        let isSubscribed = true;
        let timeoutId: ReturnType<typeof setTimeout>;
        const startTime = Date.now();
        const MAX_POLL_DURATION = 120000; // 2 minutes
        const POLL_INTERVAL = 3000; // 3 seconds

        const checkStatus = async () => {
            if (Date.now() - startTime > MAX_POLL_DURATION) {
                setError("We haven't received final confirmation from your bank yet. This sometimes happens due to network delays. Your money is safe — if the charge was successful, you will receive a receipt via email and WhatsApp once the network confirms it.");
                setStatus('DELAYED');
                return;
            }

            try {
                const response = await api.get(`/api/payments/${reference}`);
                const data = response.data;
                const currentStatus = data.payment.status;

                if (isSubscribed) {
                    if (currentStatus === 'CONFIRMED') {
                        setStatus('CONFIRMED');
                        setReceiptData(data);
                    } else if (currentStatus === 'FAILED') {
                        setStatus('FAILED');
                        setError(data.payment.failureReason || 'Payment was not successful');
                    } else {
                        // Keep polling
                        setPollCount(prev => prev + 1);
                        timeoutId = setTimeout(checkStatus, POLL_INTERVAL);
                    }
                }
            } catch (error) {
                const err = error as Error & { response?: { status?: number } };
                if (err.response?.status === 404) {
                    setError('Payment record not found. Please check your reference and try again.');
                    setStatus('FAILED');
                    return;
                }

                if (isSubscribed) {
                    // Network error - keep trying
                    setPollCount(prev => prev + 1);
                    timeoutId = setTimeout(checkStatus, POLL_INTERVAL * 2);
                }
            }
        };

        checkStatus();

        return () => {
            isSubscribed = false;
            clearTimeout(timeoutId);
        };
    }, [reference]);

    // ===================
    // RENDER STATES
    // ===================

    // FAILED STATE
    if (status === 'FAILED') {
        return (
            <div className="payment-verify">
                <div className="receipt-card failed">
                    <div className="status-icon failed">✗</div>
                    <h2>Payment Failed</h2>
                    <p className="error-message">{error || 'Unable to verify payment'}</p>

                    <div className="action-buttons">
                        <button
                            onClick={() => window.history.back()}
                            className="btn-secondary"
                        >
                            Go Back
                        </button>
                        <Link to="/" className="btn-primary">
                            Return Home
                        </Link>
                    </div>

                    <p className="help-text">
                        If you believe this is an error, please contact the vendor directly.
                    </p>
                </div>
            </div>
        );
    }

    // CONFIRMED STATE (Full Receipt)
    if (status === 'CONFIRMED' && receiptData) {
        const { payment, order, store } = receiptData;

        const formattedAmount = new Intl.NumberFormat('en-NG', {
            style: 'currency',
            currency: payment.currency,
            minimumFractionDigits: 0,
        }).format(payment.amount / 100);

        const formattedDate = new Date(payment.createdAt).toLocaleString('en-NG', {
            dateStyle: 'medium',
            timeStyle: 'short',
        });

        return (
            <div className="payment-verify">
                <div className="receipt-card confirmed">
                    {/* Success Header */}
                    <div className="status-icon confirmed">✓</div>
                    <h2>Payment Verified</h2>

                    {/* Massive Tabular Amount */}
                    <div style={{ margin: '1.5rem 0 2rem 0' }}>
                        <div className="tabular-nums" style={{ fontSize: '2.5rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>
                            {formattedAmount}
                        </div>
                    </div>

                    <div className="receipt-divider"></div>

                    {/* Store Info (Trust Signal) */}
                    {store && (
                        <div className="store-badge">
                            <span className="store-label">Purchased from</span>
                            <Link to={`/${store.slug}`} className="store-name">
                                {store.name}
                            </Link>
                        </div>
                    )}

                    {/* Order Items */}
                    {order && order.items.length > 0 && (
                        <div className="order-items">
                            {order.items.map((item, index) => (
                                <div key={index} className="order-item">
                                    <div className="item-image">
                                        {item.productImage ? (
                                            <img src={item.productImage} alt={item.productName} />
                                        ) : (
                                            <div className="placeholder-image">📦</div>
                                        )}
                                    </div>
                                    <div className="item-details">
                                        <span className="item-name">{item.productName}</span>
                                        <span className="item-qty">Qty: {item.quantity}</span>
                                    </div>
                                    <div className="item-price">
                                        ₦{(item.unitPriceKobo / 100).toLocaleString()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Receipt Details */}
                    <div className="receipt-details">
                        <div className="detail-row">
                            <span>Status</span>
                            <span style={{ fontWeight: 600, color: '#166534' }}>Successful</span>
                        </div>
                        <div className="detail-row">
                            <span>Date</span>
                            <span>{formattedDate}</span>
                        </div>
                        {order && (
                            <div className="detail-row">
                                <span>Order Reference</span>
                                <span className="order-ref">{order.shortRef}</span>
                            </div>
                        )}
                    </div>

                    {/* What Happens Next */}
                    <div className="next-steps">
                        <h3>What Happens Next?</h3>
                        <p>
                            The seller has been notified and will reach out to you
                            via WhatsApp to arrange delivery or pickup.
                        </p>
                    </div>

                    {/* Reference Footer */}
                    <p className="reference-footer" style={{ marginTop: '1.5rem' }}>
                        Ref: {reference}
                    </p>

                    {/* Powered by Tanna & Trust Signal */}
                    <div className="powered-by">
                        <div style={{ marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                            <span style={{ fontSize: '0.8rem' }}>🔒 Secured via Paystack / CBN Licensed Partners</span>
                        </div>
                        Verified by <strong>Tanna</strong>. Immutable record.
                    </div>
                </div>
            </div>
        );
    }

    // DELAYED STATE (Timeout but not explicitly failed)
    if (status === 'DELAYED') {
        return (
            <div className="payment-verify">
                <div className="receipt-card delayed" style={{ borderTop: '4px solid #f59e0b' }}>
                    <div className="status-icon" style={{ backgroundColor: '#fef3c7', color: '#d97706' }}>⏱</div>
                    <h2>Taking Longer Than Usual</h2>
                    <p className="error-message" style={{ color: '#4b5563', fontSize: '0.95rem', lineHeight: '1.5' }}>
                        {error}
                    </p>

                    <div className="action-buttons">
                        <Link to="/" className="btn-primary" style={{ backgroundColor: '#f59e0b', borderColor: '#f59e0b' }}>
                            Return to Store
                        </Link>
                    </div>

                    <p className="reference-footer">
                        Payment Ref: {reference}
                    </p>
                </div>
            </div>
        );
    }

    // PENDING STATE
    const pendingMessages = [
        "Awaiting confirmation...",
        "Verifying transaction details...",
        "Connecting securely...",
        "Almost there..."
    ];
    const messageIndex = Math.min(Math.floor(pollCount / 2), pendingMessages.length - 1);

    return (
        <div className="payment-verify">
            <div className="receipt-card pending">
                <div className="spinner"></div>
                <h2>Verifying Payment</h2>
                <p className="subtitle" style={{ minHeight: '1.5rem', transition: 'opacity 0.3s' }}>
                    {pendingMessages[messageIndex]}
                </p>

                <div className="progress-info">
                    <div className="progress-bar">
                        <div
                            className="progress-fill"
                            style={{
                                width: `${Math.min(pollCount * 5 + 10, 95)}%`,
                                transition: 'width 1s ease-out'
                            }}
                        ></div>
                    </div>
                    <p className="time-estimate">
                        This usually takes about 10 seconds.
                    </p>
                </div>

                <div className="trust-signals" style={{ marginTop: '2.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <p style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                        Secured by Paystack / CBN Licensed Partners
                    </p>
                    <p style={{ marginTop: '0.75rem' }}>Please do not close or refresh this page.</p>
                </div>
            </div>
        </div>
    );
}
