'use client';

import { useState, useEffect } from 'react';
import { useUI } from '@/contexts/UIContext';
import { Loader2, Server, Database, CheckCircle, XCircle, Clock, Info, RefreshCw, Activity, Globe, Code } from 'lucide-react';
import styles from './page.module.css';

export default function SystemInfoPage() {
    const { setPageTitle } = useUI();
    const [loading, setLoading] = useState(true);
    const [apiStatus, setApiStatus] = useState('checking');
    const [dbStatus, setDbStatus] = useState('checking');
    const [systemInfo, setSystemInfo] = useState(null);
    const [lastChecked, setLastChecked] = useState(null);

    useEffect(() => {
        setPageTitle('System Info');
        checkSystem();
    }, [setPageTitle]);

    const checkSystem = async () => {
        setLoading(true);
        setApiStatus('checking');
        setDbStatus('checking');

        const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

        // Check API status
        try {
            const response = await fetch(`${baseUrl}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });

            if (response.ok) {
                setApiStatus('online');
                // Try to get health data which might include DB status
                try {
                    const healthData = await response.json();
                    if (healthData.database) {
                        setDbStatus(healthData.database === 'connected' ? 'online' : 'offline');
                    } else {
                        setDbStatus('online'); // Assume DB is OK if API is OK
                    }
                } catch {
                    setDbStatus('online');
                }
            } else {
                setApiStatus('error');
                setDbStatus('offline');
            }
        } catch (err) {
            setApiStatus('offline');
            setDbStatus('offline');
        }

        // Get system info
        setSystemInfo({
            app_version: '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            api_url: baseUrl,
            build_time: new Date().toISOString(),
            node_version: typeof window !== 'undefined' ? navigator.userAgent : 'N/A',
        });

        setLastChecked(new Date());
        setLoading(false);
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'online':
                return styles.online;
            case 'offline':
            case 'error':
                return styles.offline;
            default:
                return styles.checking;
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'online':
                return <CheckCircle size={24} />;
            case 'offline':
            case 'error':
                return <XCircle size={24} />;
            default:
                return <Loader2 size={24} className={styles.spinner} />;
        }
    };

    return (
        <>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>System Information</h1>
                    <p className={styles.pageDescription}>
                        Monitor system status, health, and configuration details
                    </p>
                </div>
                <button className={styles.refreshButton} onClick={checkSystem} disabled={loading}>
                    {loading ? (
                        <>
                            <Loader2 size={18} className={styles.spinner} />
                            Checking...
                        </>
                    ) : (
                        <>
                            <RefreshCw size={18} />
                            Refresh Status
                        </>
                    )}
                </button>
            </div>

            {/* Status Cards Grid */}
            <div className={styles.statusGrid}>
                {/* API Server Status */}
                <div className={styles.statusCard}>
                    <div className={styles.statusCardHeader}>
                        <div className={styles.statusIconWrapper}>
                            <Server size={24} className={styles.statusIcon} />
                        </div>
                        <div className={styles.statusTitleWrapper}>
                            <h3 className={styles.statusTitle}>API Server</h3>
                            <p className={styles.statusSubtitle}>Backend API endpoint</p>
                        </div>
                    </div>
                    <div className={styles.statusCardBody}>
                        <div className={getStatusColor(apiStatus)}>
                            {getStatusIcon(apiStatus)}
                            <span className={styles.statusText}>
                                {apiStatus === 'checking' ? 'Checking...' :
                                    apiStatus === 'online' ? 'Online' :
                                        apiStatus === 'error' ? 'Error' : 'Offline'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Database Status */}
                <div className={styles.statusCard}>
                    <div className={styles.statusCardHeader}>
                        <div className={styles.statusIconWrapper}>
                            <Database size={24} className={styles.statusIcon} />
                        </div>
                        <div className={styles.statusTitleWrapper}>
                            <h3 className={styles.statusTitle}>Database</h3>
                            <p className={styles.statusSubtitle}>PostgreSQL connection</p>
                        </div>
                    </div>
                    <div className={styles.statusCardBody}>
                        <div className={getStatusColor(dbStatus)}>
                            {getStatusIcon(dbStatus)}
                            <span className={styles.statusText}>
                                {dbStatus === 'checking' ? 'Checking...' :
                                    dbStatus === 'online' ? 'Connected' : 'Unavailable'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* System Health */}
                <div className={styles.statusCard}>
                    <div className={styles.statusCardHeader}>
                        <div className={styles.statusIconWrapper}>
                            <Activity size={24} className={styles.statusIcon} />
                        </div>
                        <div className={styles.statusTitleWrapper}>
                            <h3 className={styles.statusTitle}>System Health</h3>
                            <p className={styles.statusSubtitle}>Overall system status</p>
                        </div>
                    </div>
                    <div className={styles.statusCardBody}>
                        <div className={getStatusColor(apiStatus === 'online' && dbStatus === 'online' ? 'online' : 'offline')}>
                            {getStatusIcon(apiStatus === 'online' && dbStatus === 'online' ? 'online' : 'offline')}
                            <span className={styles.statusText}>
                                {apiStatus === 'online' && dbStatus === 'online' ? 'Healthy' : 'Degraded'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* System Details */}
            {systemInfo && (
                <div className={styles.detailsCard}>
                    <div className={styles.detailsHeader}>
                        <Code size={20} />
                        <h2 className={styles.detailsTitle}>System Configuration</h2>
                    </div>
                    <div className={styles.detailsBody}>
                        <div className={styles.infoGrid}>
                            <div className={styles.infoItem}>
                                <div className={styles.infoIcon}>
                                    <Globe size={18} />
                                </div>
                                <div className={styles.infoContent}>
                                    <div className={styles.infoLabel}>Application Version</div>
                                    <div className={styles.infoValue}>{systemInfo.app_version}</div>
                                </div>
                            </div>
                            <div className={styles.infoItem}>
                                <div className={styles.infoIcon}>
                                    <Activity size={18} />
                                </div>
                                <div className={styles.infoContent}>
                                    <div className={styles.infoLabel}>Environment</div>
                                    <div className={styles.infoValue}>
                                        <span className={`badge ${systemInfo.environment === 'production' ? 'badge-warning' : 'badge-gray'}`}>
                                            {systemInfo.environment}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className={styles.infoItem}>
                                <div className={styles.infoIcon}>
                                    <Server size={18} />
                                </div>
                                <div className={styles.infoContent}>
                                    <div className={styles.infoLabel}>API URL</div>
                                    <div className={styles.infoValue}>{systemInfo.api_url}</div>
                                </div>
                            </div>
                            {lastChecked && (
                                <div className={styles.infoItem}>
                                    <div className={styles.infoIcon}>
                                        <Clock size={18} />
                                    </div>
                                    <div className={styles.infoContent}>
                                        <div className={styles.infoLabel}>Last Checked</div>
                                        <div className={styles.infoValue}>
                                            {lastChecked.toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Help Section */}
            <div className={styles.helpCard}>
                <Info size={24} className={styles.helpIcon} />
                <div className={styles.helpContent}>
                    <strong className={styles.helpTitle}>Need Help?</strong>
                    <p className={styles.helpText}>
                        If you're experiencing issues, please contact the system administrator or
                        check the server logs for more details. System status is checked automatically
                        and can be refreshed manually.
                    </p>
                </div>
            </div>
        </>
    );
}
