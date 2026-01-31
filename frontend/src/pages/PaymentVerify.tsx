import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import './PaymentVerify.css';

// ===================
// TYPES
// ===================

type PaymentStatus = 'PENDING' | 'CONFIRMED' | 'FAILED';

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
                setError('Verification timed out. Your payment may still be processing. Please check your email or contact the vendor.');
                setStatus('FAILED');
                return;
            }

            try {
                const response = await fetch(`/api/payments/${reference}`);

                if (!response.ok) {
                    if (response.status === 404) {
                        setError('Payment record not found. Please check your reference and try again.');
                        setStatus('FAILED');
                        return;
                    }
                    throw new Error('Failed to verify payment');
                }

                const data = await response.json();
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
            } catch (err) {
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
                    <h2>Payment Confirmed</h2>
                    <p className="subtitle">Your order has been placed successfully.</p>

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
                            <span>Total Paid</span>
                            <span className="amount">{formattedAmount}</span>
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
                    <p className="reference-footer">
                        Payment Ref: {reference}
                    </p>

                    {/* Powered by Tanna */}
                    <div className="powered-by">
                        Powered by <strong>Tanna</strong>
                    </div>
                </div>
            </div>
        );
    }

    // PENDING STATE
    return (
        <div className="payment-verify">
            <div className="receipt-card pending">
                <div className="spinner"></div>
                <h2>Confirming Payment...</h2>
                <p className="subtitle">
                    Please wait while we verify your transaction.
                </p>

                <div className="progress-info">
                    <div className="progress-bar">
                        <div
                            className="progress-fill"
                            style={{ width: `${Math.min(pollCount * 8, 95)}%` }}
                        ></div>
                    </div>
                    <p className="time-estimate">
                        This usually takes 5-15 seconds
                    </p>
                </div>

                <p className="warning-text">
                    Do not close this page.
                </p>
            </div>
        </div>
    );
}
