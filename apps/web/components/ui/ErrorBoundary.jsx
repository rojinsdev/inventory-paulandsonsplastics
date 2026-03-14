'use client';

import React from 'react';

/**
 * Enterprise Error Boundary to prevent the entire app from crashing.
 * It provides a graceful fallback UI and logs the error.
 */
export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        // Log the error to our backend logger (once API for logging is ready)
        console.error('[ErrorBoundary] Caught an error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            // You can render any custom fallback UI
            return (
                <div style={{
                    padding: '2rem',
                    textAlign: 'center',
                    background: 'rgba(255, 0, 0, 0.05)',
                    border: '1px solid rgba(255, 0, 0, 0.2)',
                    borderRadius: '12px',
                    margin: '2rem',
                    color: '#ff4d4d'
                }}>
                    <h2>⚠️ Something went wrong</h2>
                    <p style={{ color: '#888', marginBottom: '1.5rem' }}>
                        The application encountered an unexpected error.
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            padding: '0.75rem 1.5rem',
                            background: '#ff4d4d',
                            border: 'none',
                            borderRadius: '8px',
                            color: 'white',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                        }}
                    >
                        Try Reloading Page
                    </button>
                    {process.env.NODE_ENV === 'development' && (
                        <pre style={{
                            marginTop: '2rem',
                            textAlign: 'left',
                            fontSize: '12px',
                            overflow: 'auto',
                            maxHeight: '200px',
                            background: '#1a1a1a',
                            padding: '1rem',
                            borderRadius: '8px'
                        }}>
                            {this.state.error?.toString()}
                        </pre>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}
