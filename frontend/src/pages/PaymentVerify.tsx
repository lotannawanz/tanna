import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

type PaymentStatus = 'PENDING' | 'CONFIRMED' | 'FAILED';

export function PaymentVerify() {
    const [searchParams] = useSearchParams();
    const reference = searchParams.get('reference') || searchParams.get('trxref');

    const [status, setStatus] = useState<PaymentStatus>('PENDING');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!reference) {
            setError('No payment reference provided');
            return;
        }

        let isSubscribed = true;
        let timeoutId: ReturnType<typeof setTimeout>;

        const checkStatus = async () => {
            try {
                const response = await fetch(`/api/payments/${reference}`);

                if (!response.ok) {
                    if (response.status === 404) {
                        // Might actuaally be missing or just not synced yet
                        throw new Error('Payment record not found');
                    }
                    throw new Error('Failed to verify payment');
                }

                const data = await response.json();
                const currentStatus = data.payment.status;

                if (isSubscribed) {
                    if (currentStatus === 'CONFIRMED' || currentStatus === 'FAILED') {
                        setStatus(currentStatus);
                    } else {
                        // Keep polling if still pending
                        timeoutId = setTimeout(checkStatus, 3000);
                    }
                }
            } catch (err) {
                if (isSubscribed) {
                    // If error, just retry in a bit unless it's fatal? 
                    // For now, let's just keep trying quietly for a bit, but maybe show error if persistent
                    console.error(err);
                    // Retry anyway for network blips
                    timeoutId = setTimeout(checkStatus, 5000);
                }
            }
        };

        // Initial check
        checkStatus();

        return () => {
            isSubscribed = false;
            clearTimeout(timeoutId);
        };
    }, [reference]);

    if (error) {
        return (
            <div style={{ textAlign: 'center', maxWidth: '400px' }}>
                <h2 style={{ marginBottom: 'var(--space-2)' }}>Unable to Verify</h2>
                <p style={{ color: 'var(--text-secondary)' }}>{error}</p>
            </div>
        );
    }

    if (status === 'FAILED') {
        return (
            <div style={{ textAlign: 'center', maxWidth: '400px' }}>
                <h2 style={{ marginBottom: 'var(--space-2)' }}>Payment Failed</h2>
                <p style={{ color: 'var(--text-secondary)' }}>
                    We could not verify your payment. Please try again or contact the vendor.
                </p>
            </div>
        );
    }

    if (status === 'CONFIRMED') {
        return (
            <div style={{ textAlign: 'center', maxWidth: '400px' }}>
                <h2 style={{ marginBottom: 'var(--space-2)' }}>Payment Verified</h2>
                <p style={{ color: 'var(--text-secondary)' }}>
                    Your payment has been confirmed.
                </p>
                <p style={{
                    marginTop: 'var(--space-4)',
                    fontSize: '0.875rem',
                    color: 'var(--text-secondary)'
                }}>
                    Reference: {reference}
                </p>
            </div>
        );
    }

    return (
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
            <h2 style={{ marginBottom: 'var(--space-2)' }}>Processing payment...</h2>
            <p style={{ color: 'var(--text-secondary)' }}>
                Please wait while we confirm your transaction.
            </p>
            <div style={{
                marginTop: 'var(--space-4)',
                color: 'var(--text-secondary)',
                fontSize: '0.875rem'
            }}>
                Do not close this window.
            </div>
        </div>
    );
}
