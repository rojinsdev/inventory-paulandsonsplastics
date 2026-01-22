'use client';

import { useState, useEffect } from 'react';
import { useUI } from '@/contexts/UIContext';
import { usersAPI } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
    Users,
    Plus,
    UserCheck,
    UserX,
    X,
    AlertCircle,
    CheckCircle,
    Loader2,
} from 'lucide-react';
import styles from './page.module.css';

export default function UsersPage() {
    const { setPageTitle } = useUI();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        role: 'production_manager',
    });
    const [formError, setFormError] = useState(null);
    const [formLoading, setFormLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(null);

    useEffect(() => {
        setPageTitle('User Management');
        fetchUsers();
    }, [setPageTitle]);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const data = await usersAPI.getAll();
            setUsers(data);
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        setFormError(null);
        setFormLoading(true);

        try {
            await usersAPI.create(formData);
            setShowModal(false);
            setFormData({ name: '', email: '', password: '', role: 'production_manager' });
            fetchUsers();
        } catch (err) {
            setFormError(err.message);
        } finally {
            setFormLoading(false);
        }
    };

    const handleToggleActive = async (user) => {
        setActionLoading(user.id);
        try {
            if (user.active) {
                await usersAPI.deactivate(user.id);
            } else {
                await usersAPI.activate(user.id);
            }
            fetchUsers();
        } catch (err) {
            alert('Failed to update user status: ' + err.message);
        } finally {
            setActionLoading(null);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return '—';
        return new Date(dateString).toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    };

    return (
        <>
            {/* Page Header */}
            <div className="page-header">
                <div>
                    <p className="text-muted">Manage production managers who can access the mobile app</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                    <Plus size={18} />
                    Add User
                </button>
            </div>

            {loading ? (
                <div className={styles.loading}>
                    <Loader2 className={styles.spinner} size={32} />
                    <p>Loading users...</p>
                </div>
            ) : error ? (
                <div className={styles.error}>
                    <AlertCircle size={24} />
                    <p>Error: {error}</p>
                </div>
            ) : (
                <div className="card">
                    {users.length === 0 ? (
                        <div className="empty-state">
                            <Users size={48} />
                            <p>No users found. Create your first production manager account.</p>
                            <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                                Add User
                            </button>
                        </div>
                    ) : (
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th>Status</th>
                                    <th>Created</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((user) => (
                                    <tr key={user.id}>
                                        <td className="font-medium">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div className={styles.avatar}>
                                                    {(user.name || user.email).charAt(0).toUpperCase()}
                                                </div>
                                                <span>{user.name || '—'}</span>
                                            </div>
                                        </td>
                                        <td>{user.email}</td>
                                        <td>
                                            <span className={cn('badge', user.role === 'admin' ? 'badge-primary' : 'badge-gray')}>
                                                {user.role === 'admin' ? 'Admin' : 'Production Manager'}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={cn('badge', user.active ? 'badge-success' : 'badge-error')}>
                                                {user.active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td className="text-muted">{formatDate(user.created_at)}</td>
                                        <td>
                                            {user.role !== 'admin' && (
                                                <div className={styles.actions}>
                                                    <button
                                                        className={cn('toggle', user.active && 'active')}
                                                        onClick={() => handleToggleActive(user)}
                                                        title={user.active ? 'Deactivate' : 'Activate'}
                                                    />
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Create User Modal */}
            {showModal && (
                <div className="modal-backdrop" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Add Production Manager</h2>
                            <button className={styles.closeBtn} onClick={() => setShowModal(false)}>
                                ×
                            </button>
                        </div>
                        <form onSubmit={handleCreate}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Full Name</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="Enter full name"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Email Address</label>
                                    <input
                                        type="email"
                                        className="input"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        placeholder="Enter email address"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Password</label>
                                    <input
                                        type="password"
                                        className="input"
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        placeholder="Minimum 8 characters"
                                        minLength={8}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Role</label>
                                    <select
                                        className="select"
                                        value={formData.role}
                                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                    >
                                        <option value="production_manager">Production Manager</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </div>

                                {formError && (
                                    <div className={styles.formError}>
                                        <AlertCircle size={16} />
                                        {formError}
                                    </div>
                                )}
                            </div>

                            <div className="modal-footer">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setShowModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={formLoading}
                                >
                                    {formLoading ? (
                                        <>
                                            <Loader2 size={16} className={styles.spinner} />
                                            Creating...
                                        </>
                                    ) : (
                                        'Create User'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
