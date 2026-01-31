import { useState } from 'react';

interface BuyerInfoFormProps {
    onSubmit: (data: { name: string; phone: string }) => void;
    isLoading: boolean;
    totalAmountKobo: number;
    currency: string;
}

export function BuyerInfoForm({ onSubmit, isLoading, totalAmountKobo, currency }: BuyerInfoFormProps) {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Basic phone validation (simple check for length)
        if (phone.length < 10) {
            setError('Please enter a valid phone number');
            return;
        }

        onSubmit({ name, phone });
    };

    const formattedPrice = new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: currency,
    }).format(totalAmountKobo / 100);

    return (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div>
                <label style={{
                    display: 'block',
                    marginBottom: 'var(--space-1)',
                    fontSize: '0.875rem',
                    fontWeight: 500
                }}>
                    Full Name (Optional)
                </label>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    disabled={isLoading}
                    style={{
                        width: '100%',
                        padding: 'var(--space-3)',
                        borderRadius: '6px',
                        border: '1px solid var(--border-subtle)',
                        fontSize: '1rem'
                    }}
                />
            </div>

            <div>
                <label style={{
                    display: 'block',
                    marginBottom: 'var(--space-1)',
                    fontSize: '0.875rem',
                    fontWeight: 500
                }}>
                    WhatsApp Number <span style={{ color: 'red' }}>*</span>
                </label>
                <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 08012345678"
                    required
                    disabled={isLoading}
                    style={{
                        width: '100%',
                        padding: 'var(--space-3)',
                        borderRadius: '6px',
                        border: '1px solid var(--border-subtle)',
                        fontSize: '1rem'
                    }}
                />
                <p style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                    marginTop: 'var(--space-1)'
                }}>
                    We will send your order confirmation here.
                </p>
            </div>

            {error && (
                <div style={{ color: 'red', fontSize: '0.875rem' }}>
                    {error}
                </div>
            )}

            <button
                type="submit"
                disabled={isLoading}
                style={{
                    width: '100%',
                    padding: 'var(--space-3)',
                    backgroundColor: 'var(--color-black)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    fontWeight: 600,
                    opacity: isLoading ? 0.7 : 1
                }}
            >
                {isLoading ? 'Processing...' : `Pay ${formattedPrice}`}
            </button>
        </form>
    );
}
