'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Loader2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import styles from './page.module.css';

export default function LoginPage() {
    const { login, loading, error } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [formError, setFormError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError('');

        if (!email || !password) {
            setFormError('Please enter both email and password');
            return;
        }

        const result = await login(email, password);
        if (!result.success) {
            setFormError(result.error || 'Login failed');
        }
    };

    return (
        <div className={styles.container}>
            {/* Left Hero Section */}
            <div className={styles.heroSection}>
                <div className={styles.heroOverlay}></div>
                <div className={styles.heroContent}>


                    <div>

                    </div>
                </div>
            </div>

            {/* Right Form Section */}
            <div className={styles.formSection}>
                <div className={styles.formContainer}>
                    <div className={styles.welcomeHeader}>
                        <img
                            src="/assets/logo.png"
                            alt="Logo"
                            style={{
                                width: '240px',
                                height: 'auto',
                                marginBottom: '2rem',
                                display: 'inline-block'
                            }}
                        />
                        <h2 className={styles.title}>Welcome Back</h2>
                        <p className={styles.subtitle}>Enter your email and password to access your account</p>
                    </div>

                    <form onSubmit={handleSubmit} className={styles.form}>
                        {(formError || error) && (
                            <div className={styles.errorBox}>
                                <AlertCircle size={18} />
                                <span>{formError || error}</span>
                            </div>
                        )}

                        <div className={styles.formGroup}>
                            <label htmlFor="email" className={styles.label}>Email</label>
                            <input
                                id="email"
                                type="email"
                                className={styles.input}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Enter your email"
                                disabled={loading}
                                autoComplete="email"
                                autoFocus
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label htmlFor="password" className={styles.label}>Password</label>
                            <div className={styles.inputWrapper}>
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    className={styles.input}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter your password"
                                    disabled={loading}
                                    autoComplete="current-password"
                                />
                                <button
                                    type="button"
                                    className={styles.eyeButton}
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>
                        </div>



                        <button type="submit" className={styles.submitBtn} disabled={loading}>
                            {loading ? (
                                <>
                                    <Loader2 size={18} className={styles.spinner} />
                                    Signing In...
                                </>
                            ) : (
                                'Sign In'
                            )}
                        </button>


                    </form>
                </div>
            </div>
        </div>
    );
}
