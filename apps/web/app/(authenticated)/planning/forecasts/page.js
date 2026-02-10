'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { planningAPI } from '@/lib/api/planning';
import { productsAPI } from '@/lib/api';
import {
    TrendingUp,
    Calendar,
    RefreshCw,
    Download,
    Loader2,
    AlertCircle,
    Target,
    CheckCircle2,
} from 'lucide-react';
import { LineChart } from '@mui/x-charts/LineChart';
import { useUI } from '@/contexts/UIContext';
import styles from './page.module.css';

const FORECAST_METHODS = [
    { label: 'All Methods', value: '' },
    { label: 'Simple Moving Average', value: 'SMA' },
    { label: 'Weighted Moving Average', value: 'WMA' },
    { label: 'Seasonal Adjusted', value: 'seasonal' },
    { label: 'Hybrid', value: 'hybrid' },
];

export default function ForecastsPage() {
    const { setPageTitle } = useUI();
    const [selectedProduct, setSelectedProduct] = useState('');
    const [selectedMethod, setSelectedMethod] = useState('');

    // Query for products
    const { data: products = [] } = useQuery({
        queryKey: ['products'],
        queryFn: () => productsAPI.getAll().then(res => res || []),
    });

    // Query for forecasts
    const { data: forecastData, isLoading: forecastsLoading, error: forecastError, refetch: refetchForecasts } = useQuery({
        queryKey: ['forecasts', selectedProduct, selectedMethod],
        queryFn: () => {
            if (!selectedProduct) return null;
            const filters = {
                product_id: selectedProduct,
                ...(selectedMethod && { forecast_method: selectedMethod }),
            };
            return planningAPI.getForecasts(filters);
        },
        enabled: !!selectedProduct,
    });

    const loading = forecastsLoading;
    const error = forecastError?.message;
    const forecasts = forecastData?.forecasts || [];
    const accuracySummary = forecastData?.accuracy_summary || null;

    useEffect(() => {
        setPageTitle('Demand Forecasts');
    }, [setPageTitle]);

    useEffect(() => {
        if (products.length > 0 && !selectedProduct) {
            setSelectedProduct(products[0].id);
        }
    }, [products, selectedProduct]);

    const loadForecasts = () => {
        refetchForecasts();
    };



    const handleExport = () => {
        if (forecasts.length === 0) return;

        const csvRows = [
            ['Product', 'Forecast Date', 'Horizon (Months)', 'Forecasted Qty', 'Actual Qty', 'Accuracy %', 'Method', 'Confidence Lower', 'Confidence Upper'],
            ...forecasts.map(f => [
                f.product_name,
                f.forecast_date,
                f.forecast_horizon_months,
                f.forecasted_quantity,
                f.actual_quantity || 'N/A',
                f.accuracy_percentage ? f.accuracy_percentage.toFixed(1) : 'N/A',
                f.forecast_method,
                f.confidence_interval_lower || 'N/A',
                f.confidence_interval_upper || 'N/A',
            ]),
        ];

        const csvContent = csvRows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `demand-forecasts-${selectedProduct}-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const getAccuracyColor = (accuracy) => {
        if (accuracy >= 80) return '#10b981';
        if (accuracy >= 60) return '#f59e0b';
        return '#ef4444';
    };

    const getMethodBadgeColor = (method) => {
        const colors = {
            SMA: '#3b82f6',
            WMA: '#8b5cf6',
            seasonal: '#ec4899',
            hybrid: '#10b981',
        };
        return colors[method] || '#6b7280';
    };

    // Prepare chart data
    const chartData = forecasts.length > 0 ? {
        dates: forecasts.map(f => f.forecast_date),
        forecasted: forecasts.map(f => f.forecasted_quantity),
        actual: forecasts.map(f => f.actual_quantity || null),
        lower: forecasts.map(f => f.confidence_interval_lower || null),
        upper: forecasts.map(f => f.confidence_interval_upper || null),
    } : null;

    if (loading && !forecasts.length) {
        return (
            <div className={styles.loading}>
                <Loader2 className={styles.spinner} size={32} />
                <span>Loading forecasts...</span>
            </div>
        );
    }

    return (
        <>
            {/* Header */}
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Demand Forecasts</h1>
                    <p className={styles.pageDescription}>
                        Future demand predictions with accuracy tracking
                    </p>
                </div>
                <div className={styles.headerActions}>
                    <button onClick={loadForecasts} className={styles.refreshButton}>
                        <RefreshCw size={16} />
                        Refresh
                    </button>
                    {forecasts.length > 0 && (
                        <button onClick={handleExport} className={styles.exportButton}>
                            <Download size={16} />
                            Export CSV
                        </button>
                    )}
                </div>
            </div>

            {/* Filters */}
            <div className={styles.filterBar}>
                <div className={styles.filterGroup}>
                    <Target size={16} className={styles.filterIcon} />
                    <label className={styles.filterLabel}>Product:</label>
                    <select
                        className={styles.filterSelect}
                        value={selectedProduct}
                        onChange={(e) => setSelectedProduct(e.target.value)}
                    >
                        {products.map((product) => (
                            <option key={product.id} value={product.id}>
                                {product.product_name || product.name} ({product.size})
                            </option>
                        ))}
                    </select>
                </div>

                <div className={styles.filterGroup}>
                    <label className={styles.filterLabel}>Method:</label>
                    <select
                        className={styles.filterSelect}
                        value={selectedMethod}
                        onChange={(e) => setSelectedMethod(e.target.value)}
                    >
                        {FORECAST_METHODS.map((method) => (
                            <option key={method.value} value={method.value}>
                                {method.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Accuracy Summary */}
            {accuracySummary && (
                <div className={styles.statsGrid}>
                    <div className={styles.statCard}>
                        <div className={styles.statLabel}>Total Forecasts</div>
                        <div className={styles.statValue}>{accuracySummary.total_forecasts}</div>
                    </div>
                    <div className={styles.statCard}>
                        <div className={styles.statLabel}>With Actuals</div>
                        <div className={styles.statValue}>{accuracySummary.forecasts_with_actuals}</div>
                    </div>
                    <div className={styles.statCard}>
                        <div className={styles.statLabel}>Average Accuracy</div>
                        <div
                            className={styles.statValue}
                            style={{ color: getAccuracyColor(accuracySummary.average_accuracy || 0) }}
                        >
                            {accuracySummary.average_accuracy ? `${accuracySummary.average_accuracy.toFixed(1)}%` : 'N/A'}
                        </div>
                    </div>
                    <div className={styles.statCard}>
                        <div className={styles.statLabel}>Best Method</div>
                        <div className={styles.statValue}>
                            {accuracySummary.by_method && accuracySummary.by_method.length > 0
                                ? accuracySummary.by_method[0].method
                                : 'N/A'}
                        </div>
                    </div>
                </div>
            )}

            {/* Chart */}
            {chartData && chartData.dates.length > 0 && (
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Forecast vs Actual</h2>
                    <div className={styles.chartContainer}>
                        <LineChart
                            xAxis={[{
                                scaleType: 'point',
                                data: chartData.dates,
                            }]}
                            series={[
                                {
                                    label: 'Forecasted',
                                    data: chartData.forecasted,
                                    color: '#3b82f6',
                                    showMark: true,
                                },
                                {
                                    label: 'Actual',
                                    data: chartData.actual,
                                    color: '#10b981',
                                    showMark: true,
                                },
                            ]}
                            height={400}
                            margin={{ top: 20, bottom: 60, left: 80, right: 20 }}
                        />
                    </div>
                </div>
            )}

            {/* Forecasts Table */}
            {error && (
                <div className={styles.error}>
                    <AlertCircle size={24} />
                    <p>{error}</p>
                </div>
            )}

            {forecasts.length > 0 ? (
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Forecast Details</h2>
                    <div className={styles.tableContainer}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Forecast Date</th>
                                    <th style={{ textAlign: 'right' }}>Horizon</th>
                                    <th style={{ textAlign: 'right' }}>Forecasted Qty</th>
                                    <th style={{ textAlign: 'right' }}>Actual Qty</th>
                                    <th style={{ textAlign: 'right' }}>Accuracy</th>
                                    <th>Method</th>
                                    <th style={{ textAlign: 'right' }}>Confidence Range</th>
                                </tr>
                            </thead>
                            <tbody>
                                {forecasts.map((forecast) => (
                                    <tr key={forecast.id}>
                                        <td>
                                            <div className={styles.dateCell}>
                                                <Calendar size={14} className={styles.dateIcon} />
                                                {new Date(forecast.forecast_date).toLocaleDateString()}
                                            </div>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            {forecast.forecast_horizon_months} month{forecast.forecast_horizon_months > 1 ? 's' : ''}
                                        </td>
                                        <td style={{ textAlign: 'right' }} className={styles.numberCell}>
                                            {forecast.forecasted_quantity.toLocaleString()}
                                        </td>
                                        <td style={{ textAlign: 'right' }} className={styles.numberCell}>
                                            {forecast.actual_quantity !== null ? (
                                                <div className={styles.actualCell}>
                                                    <CheckCircle2 size={14} className={styles.actualIcon} />
                                                    {forecast.actual_quantity.toLocaleString()}
                                                </div>
                                            ) : (
                                                <span className={styles.noData}>Pending</span>
                                            )}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            {forecast.accuracy_percentage !== null ? (
                                                <span
                                                    className={styles.accuracyBadge}
                                                    style={{ background: getAccuracyColor(forecast.accuracy_percentage) }}
                                                >
                                                    {forecast.accuracy_percentage.toFixed(1)}%
                                                </span>
                                            ) : (
                                                <span className={styles.noData}>N/A</span>
                                            )}
                                        </td>
                                        <td>
                                            <span
                                                className={styles.methodBadge}
                                                style={{ background: getMethodBadgeColor(forecast.forecast_method) }}
                                            >
                                                {forecast.forecast_method}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            {forecast.confidence_interval_lower && forecast.confidence_interval_upper ? (
                                                <span className={styles.confidenceRange}>
                                                    {forecast.confidence_interval_lower.toLocaleString()} - {forecast.confidence_interval_upper.toLocaleString()}
                                                </span>
                                            ) : (
                                                <span className={styles.noData}>N/A</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className={styles.emptyState}>
                    <TrendingUp size={48} />
                    <p>No forecasts available for this product</p>
                    <p className={styles.emptyHint}>Forecasts are generated automatically based on historical data</p>
                </div>
            )}

            {/* Method Comparison */}
            {accuracySummary?.by_method && accuracySummary.by_method.length > 0 && (
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Method Performance Comparison</h2>
                    <div className={styles.methodsGrid}>
                        {accuracySummary.by_method.map((method) => (
                            <div key={method.method} className={styles.methodCard}>
                                <div className={styles.methodHeader}>
                                    <span
                                        className={styles.methodBadge}
                                        style={{ background: getMethodBadgeColor(method.method) }}
                                    >
                                        {method.method}
                                    </span>
                                </div>
                                <div className={styles.methodBody}>
                                    <div className={styles.methodStat}>
                                        <span className={styles.methodLabel}>Forecasts</span>
                                        <span className={styles.methodValue}>{method.count}</span>
                                    </div>
                                    <div className={styles.methodStat}>
                                        <span className={styles.methodLabel}>Avg Accuracy</span>
                                        <span
                                            className={styles.methodValue}
                                            style={{ color: getAccuracyColor(method.average_accuracy || 0) }}
                                        >
                                            {method.average_accuracy ? `${method.average_accuracy.toFixed(1)}%` : 'N/A'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
}
