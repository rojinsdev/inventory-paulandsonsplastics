'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
    AlertTriangle, 
    CheckCircle, 
    XCircle, 
    Clock, 
    RefreshCw,
    TrendingUp,
    Activity,
    Package,
} from 'lucide-react';
import { systemAPI } from '@/lib/api';
import styles from './SystemHealthMonitor.module.css';

export default function SystemHealthMonitor() {
    const [autoRefresh, setAutoRefresh] = useState(true);
    
    // Fetch system health data
    const { data: healthData, isLoading, error, refetch } = useQuery({
        queryKey: ['system-health-dashboard'],
        queryFn: () => systemAPI.getHealthSummary(),
        refetchInterval: autoRefresh ? 30000 : false, // Refresh every 30 seconds
        staleTime: 10000 // Consider data stale after 10 seconds
    });

    // Fetch recent errors
    const { data: errorsData } = useQuery({
        queryKey: ['system-errors-dashboard'],
        queryFn: () => systemAPI.getRecentErrors(24), // Last 24 hours
        refetchInterval: autoRefresh ? 60000 : false, // Refresh every minute
        staleTime: 30000
    });

    const getHealthStatus = (health) => {
        if (!health) return 'unknown';
        
        const stockHealth = health.stock?.health_percentage || 0;
        const errorCount = errorsData?.summary?.total_unresolved || 0;
        
        if (stockHealth >= 95 && errorCount === 0) return 'healthy';
        if (stockHealth >= 85 && errorCount < 5) return 'warning';
        return 'critical';
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'healthy': return <CheckCircle className={styles.healthyIcon} size={24} />;
            case 'warning': return <AlertTriangle className={styles.warningIcon} size={24} />;
            case 'critical': return <XCircle className={styles.criticalIcon} size={24} />;
            default: return <Clock className={styles.unknownIcon} size={24} />;
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'healthy': return '#10b981';
            case 'warning': return '#f59e0b';
            case 'critical': return '#ef4444';
            default: return '#6b7280';
        }
    };

    if (isLoading) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h3>System Health</h3>
                    <RefreshCw className={styles.spinning} size={20} />
                </div>
                <div className={styles.loading}>Loading system health data...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h3>System Health</h3>
                    <button onClick={() => refetch()} className={styles.refreshButton}>
                        <RefreshCw size={20} />
                    </button>
                </div>
                <div className={styles.error}>
                    <XCircle size={20} />
                    Failed to load system health data
                </div>
            </div>
        );
    }

    const status = getHealthStatus(healthData);
    const statusColor = getStatusColor(status);

    return (
        <div className={styles.container}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.titleSection}>
                    {getStatusIcon(status)}
                    <h3>System Health</h3>
                    <span className={styles.statusBadge} style={{ backgroundColor: statusColor }}>
                        {status.toUpperCase()}
                    </span>
                </div>
                <div className={styles.controls}>
                    <label className={styles.autoRefreshToggle}>
                        <input
                            type="checkbox"
                            checked={autoRefresh}
                            onChange={(e) => setAutoRefresh(e.target.checked)}
                        />
                        Auto-refresh
                    </label>
                    <button onClick={() => refetch()} className={styles.refreshButton}>
                        <RefreshCw size={16} />
                    </button>
                </div>
            </div>

            {/* Health Metrics Grid */}
            <div className={styles.metricsGrid}>
                {/* Orders Status */}
                <div className={styles.metricCard}>
                    <div className={styles.metricHeader}>
                        <Activity size={18} />
                        <h4>Orders</h4>
                    </div>
                    <div className={styles.metricValues}>
                        <div className={styles.metricItem}>
                            <span className={styles.metricLabel}>Pending</span>
                            <span className={styles.metricValue}>
                                {healthData?.orders?.pending || 0}
                            </span>
                        </div>
                        <div className={styles.metricItem}>
                            <span className={styles.metricLabel}>Reserved</span>
                            <span className={styles.metricValue}>
                                {healthData?.orders?.reserved || 0}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Production Requests */}
                <div className={styles.metricCard}>
                    <div className={styles.metricHeader}>
                        <TrendingUp size={18} />
                        <h4>Production</h4>
                    </div>
                    <div className={styles.metricValues}>
                        <div className={styles.metricItem}>
                            <span className={styles.metricLabel}>Pending Requests</span>
                            <span className={styles.metricValue}>
                                {healthData?.production_requests?.pending || 0}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Stock Health */}
                <div className={styles.metricCard}>
                    <div className={styles.metricHeader}>
                        <Package size={18} />
                        <h4>Stock Health</h4>
                    </div>
                    <div className={styles.metricValues}>
                        <div className={styles.metricItem}>
                            <span className={styles.metricLabel}>Health Score</span>
                            <span 
                                className={styles.metricValue}
                                style={{ 
                                    color: healthData?.stock?.health_percentage >= 95 ? '#10b981' : 
                                           healthData?.stock?.health_percentage >= 85 ? '#f59e0b' : '#ef4444'
                                }}
                            >
                                {healthData?.stock?.health_percentage || 0}%
                            </span>
                        </div>
                        <div className={styles.metricItem}>
                            <span className={styles.metricLabel}>Negative Entries</span>
                            <span className={styles.metricValue}>
                                {healthData?.stock?.negative_entries || 0}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Error Summary */}
                <div className={styles.metricCard}>
                    <div className={styles.metricHeader}>
                        <AlertTriangle size={18} />
                        <h4>System Errors</h4>
                    </div>
                    <div className={styles.metricValues}>
                        <div className={styles.metricItem}>
                            <span className={styles.metricLabel}>Last Hour</span>
                            <span className={styles.metricValue}>
                                {errorsData?.summary?.error_counts_by_type?.rpc_error || 0}
                            </span>
                        </div>
                        <div className={styles.metricItem}>
                            <span className={styles.metricLabel}>Last 24h</span>
                            <span className={styles.metricValue}>
                                {errorsData?.summary?.total_unresolved || 0}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Recent Errors */}
            {errorsData?.recent_errors && errorsData.recent_errors.length > 0 && (
                <div className={styles.errorsSection}>
                    <h4>Recent Errors</h4>
                    <div className={styles.errorsList}>
                        {errorsData.recent_errors.slice(0, 5).map((error) => (
                            <div key={error.id} className={styles.errorItem}>
                                <div className={styles.errorHeader}>
                                    <span className={styles.errorType}>{error.error_type}</span>
                                    <span className={styles.errorTime}>
                                        {Math.round(error.age_minutes)}m ago
                                    </span>
                                </div>
                                <div className={styles.errorMessage}>
                                    {error.error_message}
                                </div>
                                {error.function_name && (
                                    <div className={styles.errorFunction}>
                                        Function: {error.function_name}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Last Updated */}
            <div className={styles.footer}>
                <span className={styles.lastUpdated}>
                    Last updated: {healthData?.timestamp ? 
                        new Date(healthData.timestamp).toLocaleTimeString() : 'Unknown'
                    }
                </span>
            </div>
        </div>
    );
}