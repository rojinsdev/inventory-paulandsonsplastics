import { useState, useEffect } from 'react';
import { Loader2, FileText, User, Filter, Clock, Download, RefreshCw, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { useUI } from '@/contexts/UIContext';
import { auditAPI } from '@/lib/api';
import { useGuide } from '@/contexts/GuideContext';
import { formatDateTime, cn } from '@/lib/utils';
import styles from './page.module.css';

const ACTION_TYPES = [
    { value: '', label: 'All Actions' },
    { value: 'create', label: 'Create' },
    { value: 'update', label: 'Update' },
    { value: 'delete', label: 'Delete' },
    { value: 'login', label: 'Login' },
    { value: 'logout', label: 'Logout' },
];

const ENTITY_TYPES = [
    { value: '', label: 'All Entities' },
    { value: 'machine', label: 'Machine' },
    { value: 'product', label: 'Product' },
    { value: 'order', label: 'Order' },
    { value: 'customer', label: 'Customer' },
    { value: 'inventory', label: 'Inventory' },
    { value: 'production', label: 'Production' },
    { value: 'settings', label: 'Settings' },
];

export default function AuditLogsPage() {
    const { setPageTitle } = useUI();
    const { registerGuide } = useGuide();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [logs, setLogs] = useState([]);
    const [total, setTotal] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize] = useState(50);
    const [filters, setFilters] = useState({
        action: '',
        entity_type: '',
        date_from: '',
        date_to: '',
    });
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        setPageTitle('Audit Logs');
        registerGuide({
            title: "System Audit Trail",
            description: "Immutable record of all administrative and operational changes for accountability.",
            logic: [
                {
                    title: "Immutable History (The Black Box)",
                    explanation: "Audit logs are permanent and cannot be deleted. They act like a 'Black Box', recording every critical action from login to stock adjustments with a precise timestamp."
                },
                {
                    title: "Audit Trail Traceability",
                    explanation: "Every entry links to a specific user and IP address. The system records 'Before' and 'After' states for sensitive changes, allowing managers to troubleshoot errors or policy violations."
                }
            ],
            components: [
                {
                    name: "Activity Timeline",
                    description: "Comprehensive history of logins, record creations, updates, and deletions."
                },
                {
                    name: "Forensic Filters",
                    description: "Isolate events by specific users, entity types (e.g., Products), or action categories (e.g., Delete)."
                }
            ]
        });
        loadLogs();
    }, [currentPage, registerGuide, setPageTitle]);

    const loadLogs = async () => {
        try {
            setLoading(true);
            setError(null);
            const params = {
                ...filters,
                page: currentPage,
                limit: pageSize,
            };
            const result = await auditAPI.getLogs(params);

            // Handle both array and object responses
            if (Array.isArray(result)) {
                setLogs(result);
                setTotal(result.length);
            } else if (result && result.data) {
                setLogs(result.data || []);
                setTotal(result.total || result.data?.length || 0);
            } else {
                setLogs([]);
                setTotal(0);
            }
        } catch (err) {
            setError(err.message || 'Failed to load audit logs');
            setLogs([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    };

    const handleFilter = () => {
        setCurrentPage(1);
        loadLogs();
    };

    const handleClearFilters = () => {
        setFilters({
            action: '',
            entity_type: '',
            date_from: '',
            date_to: '',
        });
        setSearchQuery('');
        setCurrentPage(1);
        setTimeout(() => loadLogs(), 100);
    };

    const handleExport = () => {
        const csvContent = [
            ['Timestamp', 'User', 'Action', 'Entity Type', 'Entity ID', 'Description', 'IP Address'].join(','),
            ...logs.map(log => [
                log.created_at || '',
                log.user_name || log.user_email || 'System',
                log.action || '',
                log.entity_type || '',
                log.entity_id || '',
                (log.description || '').replace(/"/g, '""'),
                log.ip_address || ''
            ].map(field => `"${field}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const totalPages = Math.ceil(total / pageSize);
    const hasFilters = filters.action || filters.entity_type || filters.date_from || filters.date_to || searchQuery;

    const getActionBadge = (action) => {
        const badges = {
            create: 'badge-success',
            update: 'badge-primary',
            delete: 'badge-error',
            login: 'badge-gray',
            logout: 'badge-gray',
        };
        return badges[action] || 'badge-gray';
    };

    const getUserInitials = (name, email) => {
        if (name) {
            return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        }
        if (email) {
            return email[0].toUpperCase();
        }
        return 'S';
    };

    const filteredLogs = logs.filter(log => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            (log.user_name || '').toLowerCase().includes(query) ||
            (log.user_email || '').toLowerCase().includes(query) ||
            (log.action || '').toLowerCase().includes(query) ||
            (log.entity_type || '').toLowerCase().includes(query) ||
            (log.description || '').toLowerCase().includes(query)
        );
    });

    return (
        <>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Audit Logs</h1>
                    <p className={styles.pageDescription}>
                        Track all system activities, user actions, and changes
                    </p>
                </div>
                <div className={styles.headerActions}>
                    <button className={styles.iconButton} onClick={loadLogs} disabled={loading}>
                        <RefreshCw size={18} className={loading ? styles.spinner : ''} />
                    </button>
                    {logs.length > 0 && (
                        <button className={styles.exportButton} onClick={handleExport}>
                            <Download size={18} />
                            <span>Export CSV</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Filter Bar */}
            <div className={styles.filterBar}>
                <div className={styles.filterRow}>
                    <div className={styles.filterGroup}>
                        <Filter size={16} className={styles.filterIcon} />
                        <select
                            className={styles.filterSelect}
                            value={filters.action}
                            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
                        >
                            {ACTION_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>
                                    {t.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.filterGroup}>
                        <select
                            className={styles.filterSelect}
                            value={filters.entity_type}
                            onChange={(e) => setFilters({ ...filters, entity_type: e.target.value })}
                        >
                            {ENTITY_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>
                                    {t.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.filterGroup}>
                        <input
                            type="date"
                            className={styles.filterInput}
                            value={filters.date_from}
                            onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
                            placeholder="From Date"
                        />
                    </div>

                    <div className={styles.filterGroup}>
                        <input
                            type="date"
                            className={styles.filterInput}
                            value={filters.date_to}
                            onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
                            placeholder="To Date"
                        />
                    </div>

                    <div className={styles.filterActions}>
                        <button className={styles.applyButton} onClick={handleFilter}>
                            Apply Filters
                        </button>
                        {hasFilters && (
                            <button className={styles.clearButton} onClick={handleClearFilters}>
                                <X size={16} />
                                Clear
                            </button>
                        )}
                    </div>
                </div>

                {/* Search */}
                <div className={styles.searchRow}>
                    <div className={styles.searchWrapper}>
                        <Search size={18} className={styles.searchIcon} />
                        <input
                            type="text"
                            className={styles.searchInput}
                            placeholder="Search logs..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button
                                className={styles.clearSearch}
                                onClick={() => setSearchQuery('')}
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Stats Bar */}
            <div className={styles.statsBar}>
                <div className={styles.statItem}>
                    <span className={styles.statLabel}>Total Logs</span>
                    <span className={styles.statValue}>{total.toLocaleString()}</span>
                </div>
                <div className={styles.statItem}>
                    <span className={styles.statLabel}>Showing</span>
                    <span className={styles.statValue}>
                        {filteredLogs.length} of {logs.length}
                    </span>
                </div>
                <div className={styles.statItem}>
                    <span className={styles.statLabel}>Page</span>
                    <span className={styles.statValue}>
                        {currentPage} of {totalPages || 1}
                    </span>
                </div>
            </div>

            {/* Logs Table */}
            <div className={styles.tableCard}>
                {loading ? (
                    <div className={styles.loading}>
                        <Loader2 size={32} className={styles.spinner} />
                        <span>Loading audit logs...</span>
                    </div>
                ) : error ? (
                    <div className={styles.error}>
                        <X size={24} />
                        <p>{error}</p>
                        <button className={styles.retryButton} onClick={loadLogs}>
                            Retry
                        </button>
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <div className={styles.emptyState}>
                        <FileText size={48} />
                        <p>No audit logs found</p>
                        <p className={styles.emptyHint}>
                            {hasFilters ? 'Try adjusting your filters' : 'System activities will be logged here'}
                        </p>
                    </div>
                ) : (
                    <>
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Timestamp</th>
                                        <th>User</th>
                                        <th>Action</th>
                                        <th>Entity</th>
                                        <th>Description</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredLogs.map((log) => (
                                        <tr key={log.id}>
                                            <td className={styles.timestamp}>
                                                <Clock size={14} />
                                                {formatDateTime(log.created_at)}
                                            </td>
                                            <td>
                                                <div className={styles.userCell}>
                                                    <div className={styles.userAvatar}>
                                                        {getUserInitials(log.user_name, log.user_email)}
                                                    </div>
                                                    <div className={styles.userInfo}>
                                                        <div className={styles.userName}>
                                                            {log.user_name || 'System'}
                                                        </div>
                                                        {log.user_email && (
                                                            <div className={styles.userEmail}>{log.user_email}</div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <span className={cn('badge', getActionBadge(log.action))}>
                                                    {log.action}
                                                </span>
                                            </td>
                                            <td>
                                                <span className="badge badge-gray">
                                                    {log.entity_type}
                                                </span>
                                            </td>
                                            <td className={styles.description}>
                                                {log.description || '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className={styles.pagination}>
                                <button
                                    className={styles.pageButton}
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1 || loading}
                                >
                                    <ChevronLeft size={18} />
                                    Previous
                                </button>
                                <div className={styles.pageInfo}>
                                    Page {currentPage} of {totalPages}
                                </div>
                                <button
                                    className={styles.pageButton}
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages || loading}
                                >
                                    Next
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </>
    );
}
