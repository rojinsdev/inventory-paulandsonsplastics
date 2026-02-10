'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { planningAPI } from '@/lib/api/planning';
import {
    TrendingUp,
    TrendingDown,
    Minus,
    Calendar,
    RefreshCw,
    Download,
    Filter,
    X,
    Loader2,
    AlertCircle,
} from 'lucide-react';
import { LineChart } from '@mui/x-charts/LineChart';
import { useUI } from '@/contexts/UIContext';
import styles from './page.module.css';

const TIME_PERIODS = [
    { label: 'Last Month', value: '1m' },
    { label: 'Last 3 Months', value: '3m' },
    { label: 'Last 6 Months', value: '6m' },
    { label: 'Last Year', value: '1y' },
    { label: 'Custom Range', value: 'custom' },
];

export default function DemandInsightsPage() {
    const { setPageTitle } = useUI();
    const [period, setPeriod] = useState('3m');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [showCustomRange, setShowCustomRange] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState('');

    // Query for demand insights
    const { data: demandData, isLoading: demandLoading, error: demandError, refetch: refetchDemand } = useQuery({
        queryKey: ['demand-insights', period, customStartDate, customEndDate, selectedProduct],
        queryFn: () => {
            const filters = {
                period,
                ...(period === 'custom' && customStartDate && customEndDate && {
                    start_date: customStartDate,
                    end_date: customEndDate,
                }),
                ...(selectedProduct && { product_id: selectedProduct }),
            };
            return planningAPI.getDemandTrends(filters);
        },
    });

    // Query for seasonal patterns
    const { data: patternsData, isLoading: patternsLoading, error: patternsError, refetch: refetchPatterns } = useQuery({
        queryKey: ['seasonal-patterns'],
        queryFn: () => planningAPI.getSeasonalPatterns({ is_active: true }),
    });

    const loading = demandLoading || patternsLoading;
    const error = demandError?.message || patternsError?.message;
    const seasonalPatterns = patternsData?.patterns || [];

    useEffect(() => {
        setPageTitle('Demand Insights');
    }, [setPageTitle]);

    const loadData = () => {
        refetchDemand();
        refetchPatterns();
    };

    const handlePeriodChange = (newPeriod) => {
        setPeriod(newPeriod);
        if (newPeriod === 'custom') {
            setShowCustomRange(true);
        } else {
            setShowCustomRange(false);
        }
    };

    const handleApplyCustomRange = () => {
        if (customStartDate && customEndDate) {
            setShowCustomRange(false);
        }
    };

    const handleExport = () => {
        if (!demandData) return;

        const csvRows = [
            ['Product', 'Total Sold', 'Growth Rate', 'Trend', 'Seasonal Patterns'],
            ...demandData.products.map(p => [
                `${p.product_name} (${p.product_size})`,
                p.total_sold,
                p.growth_rate ? `${p.growth_rate.toFixed(1)}%` : 'N/A',
                p.trend,
                p.seasonal_patterns.map(sp => sp.pattern_name).join('; ') || 'None',
            ]),
        ];

        const csvContent = csvRows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `demand-insights-${period}-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const getTrendIcon = (trend) => {
        switch (trend) {
            case 'growing':
                return <TrendingUp size={18} className={styles.trendIconGrowing} />;
            case 'declining':
                return <TrendingDown size={18} className={styles.trendIconDeclining} />;
            default:
                return <Minus size={18} className={styles.trendIconStable} />;
        }
    };

    const getTrendColor = (trend) => {
        switch (trend) {
            case 'growing':
                return '#10b981';
            case 'declining':
                return '#ef4444';
            default:
                return '#6b7280';
        }
    };

    if (loading) {
        return (
            <div className={styles.loading}>
                <Loader2 className={styles.spinner} size={32} />
                <span>Loading demand insights...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.error}>
                <AlertCircle size={32} />
                <p>{error}</p>
                <button onClick={loadData} className={styles.retryButton}>
                    <RefreshCw size={16} />
                    Retry
                </button>
            </div>
        );
    }

    return (
        <>
            {/* Header */}
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Demand Insights</h1>
                    <p className={styles.pageDescription}>
                        Analyze historical demand trends and seasonal patterns
                    </p>
                </div>
                <div className={styles.headerActions}>
                    <button onClick={loadData} className={styles.refreshButton}>
                        <RefreshCw size={16} />
                        Refresh
                    </button>
                    {demandData?.products?.length > 0 && (
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
                    <Calendar size={16} className={styles.filterIcon} />
                    <select
                        className={styles.filterSelect}
                        value={period}
                        onChange={(e) => handlePeriodChange(e.target.value)}
                    >
                        {TIME_PERIODS.map((p) => (
                            <option key={p.value} value={p.value}>
                                {p.label}
                            </option>
                        ))}
                    </select>
                </div>

                {showCustomRange && (
                    <div className={styles.customRangeGroup}>
                        <input
                            type="date"
                            className={styles.dateInput}
                            value={customStartDate}
                            onChange={(e) => setCustomStartDate(e.target.value)}
                            max={new Date().toISOString().split('T')[0]}
                        />
                        <span>to</span>
                        <input
                            type="date"
                            className={styles.dateInput}
                            value={customEndDate}
                            onChange={(e) => setCustomEndDate(e.target.value)}
                            max={new Date().toISOString().split('T')[0]}
                        />
                        <button
                            onClick={handleApplyCustomRange}
                            className={styles.applyButton}
                            disabled={!customStartDate || !customEndDate}
                        >
                            Apply
                        </button>
                        <button
                            onClick={() => {
                                setShowCustomRange(false);
                                setPeriod('3m');
                            }}
                            className={styles.cancelButton}
                        >
                            <X size={16} />
                        </button>
                    </div>
                )}
            </div>

            {/* Summary Stats */}
            {demandData && (
                <div className={styles.statsGrid}>
                    <div className={styles.statCard}>
                        <div className={styles.statLabel}>Total Products</div>
                        <div className={styles.statValue}>{demandData.products.length}</div>
                    </div>
                    <div className={styles.statCard}>
                        <div className={styles.statLabel}>Growing Products</div>
                        <div className={styles.statValue}>
                            {demandData.products.filter(p => p.trend === 'growing').length}
                        </div>
                    </div>
                    <div className={styles.statCard}>
                        <div className={styles.statLabel}>Seasonal Patterns</div>
                        <div className={styles.statValue}>{seasonalPatterns.length}</div>
                    </div>
                    <div className={styles.statCard}>
                        <div className={styles.statLabel}>Period</div>
                        <div className={styles.statValue}>
                            {demandData.start_date} to {demandData.end_date}
                        </div>
                    </div>
                </div>
            )}

            {/* Product Trends Table */}
            {demandData?.products?.length > 0 ? (
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Product Demand Trends</h2>
                    <div className={styles.tableContainer}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th style={{ textAlign: 'right' }}>Total Sold</th>
                                    <th style={{ textAlign: 'right' }}>Growth Rate</th>
                                    <th>Trend</th>
                                    <th>Seasonal Patterns</th>
                                    <th>Chart</th>
                                </tr>
                            </thead>
                            <tbody>
                                {demandData.products.map((product) => (
                                    <tr key={product.product_id}>
                                        <td className={styles.productCell}>
                                            <div className={styles.productName}>{product.product_name}</div>
                                            <div className={styles.productDetails}>
                                                {product.product_size} • {product.product_color}
                                            </div>
                                        </td>
                                        <td style={{ textAlign: 'right' }} className={styles.numberCell}>
                                            {product.total_sold.toLocaleString()}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            {product.growth_rate !== null ? (
                                                <span
                                                    className={styles.growthRate}
                                                    style={{ color: getTrendColor(product.trend) }}
                                                >
                                                    {product.growth_rate > 0 ? '+' : ''}
                                                    {product.growth_rate.toFixed(1)}%
                                                </span>
                                            ) : (
                                                <span className={styles.noData}>N/A</span>
                                            )}
                                        </td>
                                        <td>
                                            <div className={styles.trendBadge}>
                                                {getTrendIcon(product.trend)}
                                                <span>{product.trend}</span>
                                            </div>
                                        </td>
                                        <td>
                                            {product.seasonal_patterns.length > 0 ? (
                                                <div className={styles.patternsList}>
                                                    {product.seasonal_patterns.map((pattern, idx) => (
                                                        <span key={idx} className={styles.patternBadge}>
                                                            {pattern.pattern_name}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className={styles.noData}>None detected</span>
                                            )}
                                        </td>
                                        <td>
                                            {product.monthly_breakdown.length >= 2 && (
                                                <div className={styles.miniChart}>
                                                    <LineChart
                                                        xAxis={[{
                                                            scaleType: 'point',
                                                            data: product.monthly_breakdown.map(m => m.month.substring(5)),
                                                        }]}
                                                        series={[{
                                                            data: product.monthly_breakdown.map(m => m.quantity),
                                                            color: getTrendColor(product.trend),
                                                            showMark: false,
                                                        }]}
                                                        height={60}
                                                        margin={{ top: 5, bottom: 5, left: 5, right: 5 }}
                                                    />
                                                </div>
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
                    <AlertCircle size={48} />
                    <p>No demand data found for the selected period</p>
                    <p className={styles.emptyHint}>Try selecting a different time range</p>
                </div>
            )}

            {/* Seasonal Patterns Section */}
            {seasonalPatterns.length > 0 && (
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Detected Seasonal Patterns</h2>
                    <div className={styles.patternsGrid}>
                        {seasonalPatterns.map((pattern) => (
                            <div key={pattern.id} className={styles.patternCard}>
                                <div className={styles.patternHeader}>
                                    <h3 className={styles.patternName}>{pattern.pattern_name || 'Unnamed Pattern'}</h3>
                                    <span className={styles.confidenceBadge}>
                                        {Math.round(pattern.confidence_score || 0)}% confidence
                                    </span>
                                </div>
                                <div className={styles.patternBody}>
                                    <div className={styles.patternDetail}>
                                        <span className={styles.patternLabel}>Product:</span>
                                        <span>{pattern.product_name || 'All Products'}</span>
                                    </div>
                                    <div className={styles.patternDetail}>
                                        <span className={styles.patternLabel}>Period:</span>
                                        <span>
                                            {new Date(2000, pattern.start_month - 1).toLocaleString('default', { month: 'long' })}
                                            {pattern.end_month !== pattern.start_month && (
                                                <> - {new Date(2000, pattern.end_month - 1).toLocaleString('default', { month: 'long' })}</>
                                            )}
                                        </span>
                                    </div>
                                    <div className={styles.patternDetail}>
                                        <span className={styles.patternLabel}>Demand Increase:</span>
                                        <span className={styles.multiplier}>
                                            +{((pattern.demand_multiplier - 1) * 100).toFixed(0)}%
                                        </span>
                                    </div>
                                    {pattern.years_detected && pattern.years_detected.length > 0 && (
                                        <div className={styles.patternDetail}>
                                            <span className={styles.patternLabel}>Observed in:</span>
                                            <span>{pattern.years_detected.join(', ')}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
}
