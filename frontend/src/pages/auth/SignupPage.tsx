import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export function SignupPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [phone, setPhone] = useState('');
    const [storeName, setStoreName] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();
    const { signup } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const response = await api.post('/api/auth/signup', {
                email,
                password,
                phone,
                storeName,
            });

            const { token, vendor } = response.data;
            signup(token, vendor);

            // Go directly to dashboard (store is created automatically)
            navigate(`/vendor/${vendor.id}/dashboard`);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Signup failed');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div>
            <h2 style={{ marginBottom: 'var(--space-4)', fontSize: '1.25rem' }}>Sign Up</h2>

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
                        value={storeName}
                        onChange={(e) => setStoreName(e.target.value)}
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
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
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
                        type="tel"
                        placeholder="Phone Number"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
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
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
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
                    {isLoading ? 'Creating Account...' : 'Sign Up'}
                </button>
            </form>

            <div style={{ marginTop: 'var(--space-4)' }}>
                <p style={{ color: 'var(--text-secondary)' }}>
                    Already have an account? <Link to="/login">Login</Link>
                </p>
            </div>
        </div>
    );
}
