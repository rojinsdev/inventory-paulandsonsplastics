'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { planningAPI } from '@/lib/api/planning';
import {
    CheckCircle,
    XCircle,
    Calendar,
    RefreshCw,
    Download,
    Loader2,
    AlertCircle,
    TrendingUp,
    Package,
    Sparkles,
    Edit2,
    Check,
    X,
} from 'lucide-react';
import { useUI } from '@/contexts/UIContext';
import styles from './page.module.css';

export default function RecommendationsPage() {
    const queryClient = useQueryClient();
    const { setPageTitle } = useUI();
    const [targetMonth, setTargetMonth] = useState('');
    const [statusFilter, setStatusFilter] = useState('pending');
    const [editingId, setEditingId] = useState(null);
    const [adjustedQty, setAdjustedQty] = useState('');
    const [rejectReason, setRejectReason] = useState('');
    const [showRejectModal, setShowRejectModal] = useState(null);

    // Queries
    const { data: recData, isLoading: loading, error: queryError, refetch: loadRecommendations } = useQuery({
        queryKey: ['recommendations', targetMonth, statusFilter],
        queryFn: () => planningAPI.getRecommendations({
            target_month: targetMonth,
            status: statusFilter,
        }),
        enabled: !!targetMonth,
    });

    const error = queryError?.message;
    const recommendations = recData?.recommendations || [];

    // Mutations
    const generateMutation = useMutation({
        mutationFn: (month) => planningAPI.generateRecommendations(month),
        onSuccess: () => {
            // Background job takes time, but we invalidate to show progress or refresh
            setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ['recommendations'] });
            }, 2000);
        },
        onError: (err) => alert('Error: ' + err.message)
    });

    const acceptMutation = useMutation({
        mutationFn: ({ id, qty }) => planningAPI.acceptRecommendation(id, qty),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['recommendations'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            setEditingId(null);
            setAdjustedQty('');
        },
        onError: (err) => alert(`Failed to accept: ${err.message}`)
    });

    const rejectMutation = useMutation({
        mutationFn: ({ id, reason }) => planningAPI.rejectRecommendation(id, reason),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['recommendations'] });
            setShowRejectModal(null);
            setRejectReason('');
        },
        onError: (err) => alert(`Failed to reject: ${err.message}`)
    });

    const actionLoading = acceptMutation.isPending || rejectMutation.isPending ? (acceptMutation.variables?.id || rejectMutation.variables?.id) : null;


    useEffect(() => {
        setPageTitle('Production Recommendations');
        // Set default to next month if not set
        if (!targetMonth) {
            const nextMonth = new Date();
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            const monthStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;
            setTargetMonth(monthStr);
        }
    }, [setPageTitle, targetMonth]);

    const handleGenerateRecommendations = async () => {
        if (!targetMonth) return;
        generateMutation.mutate(targetMonth);
    };

    const handleAccept = async (id, originalQty) => {
        const qty = editingId === id && adjustedQty ? parseInt(adjustedQty) : null;
        acceptMutation.mutate({ id, qty });
    };

    const handleReject = async (id) => {
        rejectMutation.mutate({ id, reason: rejectReason || null });
    };

    const handleExport = () => {
        if (recommendations.length === 0) return;

        const csvRows = [
            ['Tub', 'Size', 'Color', 'Recommended Qty', 'Current Stock', 'Avg Monthly Sales', 'Trend %', 'Seasonal %', 'Confidence', 'Reasoning', 'Status'],
            ...recommendations.map(r => [
                r.product_name,
                r.product_size,
                r.product_color,
                r.recommended_quantity,
                r.current_stock_level || 0,
                r.average_monthly_sales || 0,
                r.trend_adjustment_percentage?.toFixed(1) || 0,
                r.seasonal_adjustment_percentage?.toFixed(1) || 0,
                r.confidence_score || 0,
                r.reasoning,
                r.status,
            ]),
        ];

        const csvContent = csvRows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `production-recommendations-${targetMonth}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const getConfidenceColor = (score) => {
        if (score >= 80) return '#10b981';
        if (score >= 60) return '#f59e0b';
        return '#ef4444';
    };

    const getStatusBadge = (status) => {
        const badges = {
            pending: { label: 'Pending Review', color: '#f59e0b', icon: AlertCircle },
            accepted: { label: 'Accepted', color: '#10b981', icon: CheckCircle },
            rejected: { label: 'Rejected', color: '#ef4444', icon: XCircle },
        };
        const badge = badges[status] || badges.pending;
        const Icon = badge.icon;
        return (
            <span className={styles.statusBadge} style={{ background: badge.color }}>
                <Icon size={14} />
                {badge.label}
            </span>
        );
    };

    if (loading && !recommendations.length) {
        return (
            <div className={styles.loading}>
                <Loader2 className={styles.spinner} size={32} />
                <span>Loading recommendations...</span>
            </div>
        );
    }

    return (
        <>
            {/* Header */}
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Production Recommendations</h1>
                    <p className={styles.pageDescription}>
                        AI-generated production quantities based on demand trends
                    </p>
                </div>
                <div className={styles.headerActions}>
                    <button onClick={loadRecommendations} className={styles.refreshButton}>
                        <RefreshCw size={16} />
                        Refresh
                    </button>
                    {recommendations.length > 0 && (
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
                    <label className={styles.filterLabel}>Target Month:</label>
                    <input
                        type="month"
                        className={styles.monthInput}
                        value={targetMonth}
                        onChange={(e) => setTargetMonth(e.target.value)}
                    />
                </div>

                <div className={styles.filterGroup}>
                    <label className={styles.filterLabel}>Status:</label>
                    <select
                        className={styles.filterSelect}
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <option value="">All</option>
                        <option value="pending">Pending</option>
                        <option value="accepted">Accepted</option>
                        <option value="rejected">Rejected</option>
                    </select>
                </div>

                <button onClick={handleGenerateRecommendations} className={styles.generateButton}>
                    <Sparkles size={16} />
                    Generate Recommendations
                </button>
            </div>

            {/* Summary Stats */}
            {recommendations.length > 0 && (
                <div className={styles.statsGrid}>
                    <div className={styles.statCard}>
                        <div className={styles.statLabel}>Total Recommendations</div>
                        <div className={styles.statValue}>{recommendations.length}</div>
                    </div>
                    <div className={styles.statCard}>
                        <div className={styles.statLabel}>Pending Review</div>
                        <div className={styles.statValue}>
                            {recommendations.filter(r => r.status === 'pending').length}
                        </div>
                    </div>
                    <div className={styles.statCard}>
                        <div className={styles.statLabel}>Accepted</div>
                        <div className={styles.statValue}>
                            {recommendations.filter(r => r.status === 'accepted').length}
                        </div>
                    </div>
                    <div className={styles.statCard}>
                        <div className={styles.statLabel}>Avg Confidence</div>
                        <div className={styles.statValue}>
                            {Math.round(recommendations.reduce((sum, r) => sum + (r.confidence_score || 0), 0) / recommendations.length)}%
                        </div>
                    </div>
                </div>
            )}

            {/* Recommendations Table */}
            {error && (
                <div className={styles.error}>
                    <AlertCircle size={24} />
                    <p>{error}</p>
                </div>
            )}

            {recommendations.length > 0 ? (
                <div className={styles.section}>
                    <div className={styles.tableContainer}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Tub</th>
                                    <th style={{ textAlign: 'right' }}>Recommended Qty</th>
                                    <th style={{ textAlign: 'right' }}>Current Stock</th>
                                    <th style={{ textAlign: 'right' }}>Avg Monthly Sales</th>
                                    <th>Reasoning</th>
                                    <th style={{ textAlign: 'center' }}>Confidence</th>
                                    <th>Status</th>
                                    <th style={{ textAlign: 'center' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recommendations.map((rec) => (
                                    <tr key={rec.id}>
                                        <td className={styles.productCell}>
                                            <div className={styles.productName}>{rec.product_name}</div>
                                            <div className={styles.productDetails}>
                                                {rec.product_size} • {rec.product_color}
                                            </div>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            {editingId === rec.id ? (
                                                <input
                                                    type="number"
                                                    className={styles.qtyInput}
                                                    value={adjustedQty}
                                                    onChange={(e) => setAdjustedQty(e.target.value)}
                                                    placeholder={rec.recommended_quantity.toString()}
                                                    autoFocus
                                                />
                                            ) : (
                                                <div className={styles.qtyDisplay}>
                                                    <span className={styles.qtyValue}>
                                                        {rec.adjusted_quantity || rec.recommended_quantity}
                                                    </span>
                                                    {rec.status === 'pending' && (
                                                        <button
                                                            onClick={() => {
                                                                setEditingId(rec.id);
                                                                setAdjustedQty('');
                                                            }}
                                                            className={styles.editButton}
                                                        >
                                                            <Edit2 size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ textAlign: 'right' }} className={styles.numberCell}>
                                            {rec.current_stock_level?.toLocaleString() || 0}
                                        </td>
                                        <td style={{ textAlign: 'right' }} className={styles.numberCell}>
                                            {rec.average_monthly_sales?.toLocaleString() || 0}
                                        </td>
                                        <td>
                                            <div className={styles.reasoning}>{rec.reasoning}</div>
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <div
                                                className={styles.confidenceBadge}
                                                style={{ background: getConfidenceColor(rec.confidence_score || 0) }}
                                            >
                                                {rec.confidence_score || 0}%
                                            </div>
                                        </td>
                                        <td>{getStatusBadge(rec.status)}</td>
                                        <td>
                                            {rec.status === 'pending' && (
                                                <div className={styles.actionButtons}>
                                                    {editingId === rec.id ? (
                                                        <>
                                                            <button
                                                                onClick={() => handleAccept(rec.id, rec.recommended_quantity)}
                                                                className={styles.saveButton}
                                                                disabled={actionLoading === rec.id}
                                                            >
                                                                <Check size={14} />
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setEditingId(null);
                                                                    setAdjustedQty('');
                                                                }}
                                                                className={styles.cancelEditButton}
                                                            >
                                                                <X size={14} />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={() => handleAccept(rec.id, rec.recommended_quantity)}
                                                                className={styles.acceptButton}
                                                                disabled={actionLoading === rec.id}
                                                            >
                                                                {actionLoading === rec.id ? (
                                                                    <Loader2 className={styles.spinner} size={14} />
                                                                ) : (
                                                                    <CheckCircle size={14} />
                                                                )}
                                                                Accept
                                                            </button>
                                                            <button
                                                                onClick={() => setShowRejectModal(rec.id)}
                                                                className={styles.rejectButton}
                                                                disabled={actionLoading === rec.id}
                                                            >
                                                                <XCircle size={14} />
                                                                Reject
                                                            </button>
                                                        </>
                                                    )}
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
                    <Package size={48} />
                    <p>No recommendations found for {targetMonth}</p>
                    <p className={styles.emptyHint}>Click &quot;Generate Recommendations&quot; to create new ones</p>
                </div>
            )}

            {/* Reject Modal */}
            {showRejectModal && (
                <div className={styles.modalOverlay} onClick={() => setShowRejectModal(null)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <h3 className={styles.modalTitle}>Reject Recommendation</h3>
                        <p className={styles.modalDescription}>
                            Please provide a reason for rejecting this recommendation (optional)
                        </p>
                        <textarea
                            className={styles.textarea}
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="e.g., Overstock expected, market conditions changed..."
                            rows={4}
                        />
                        <div className={styles.modalActions}>
                            <button
                                onClick={() => setShowRejectModal(null)}
                                className={styles.modalCancelButton}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleReject(showRejectModal)}
                                className={styles.modalRejectButton}
                                disabled={actionLoading === showRejectModal}
                            >
                                {actionLoading === showRejectModal ? (
                                    <Loader2 className={styles.spinner} size={16} />
                                ) : (
                                    'Reject'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
