'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUI } from '@/contexts/UIContext';
import { usersAPI, factoriesAPI } from '@/lib/api';
// Fallback for factoriesAPI if not exported from main api file yet
import { factoriesAPI as factoriesAPIArgs } from '@/lib/api-factories';
const factoriesClient = factoriesAPI.getAll ? factoriesAPI : factoriesAPIArgs;
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
    Edit,
} from 'lucide-react';
import styles from './page.module.css';

export default function UsersPage() {
    const queryClient = useQueryClient();
    const { setPageTitle } = useUI();

    // Queries
    const { data: users, isLoading: loading, error: queryError, refetch } = useQuery({
        queryKey: ['users'],
        queryFn: () => usersAPI.getAll(),
    });

    const { data: factories = [] } = useQuery({
        queryKey: ['factories'],
        queryFn: () => factoriesClient.getAll(),
    });

    const error = queryError?.message;

    // Mutations
    const createMutation = useMutation({
        mutationFn: (data) => usersAPI.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            setShowModal(false);
            resetForm();
        },
        onError: (err) => setFormError(err.message)
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => usersAPI.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            setShowModal(false);
            resetForm();
        },
        onError: (err) => setFormError(err.message)
    });

    const toggleMutation = useMutation({
        mutationFn: ({ id, active }) => active ? usersAPI.deactivate(id) : usersAPI.activate(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
        onError: (err) => alert('Failed to update user status: ' + err.message)
    });

    const [showModal, setShowModal] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        role: 'production_manager',
        factory_id: '',
    });
    const [formError, setFormError] = useState(null);

    const formLoading = createMutation.isPending || updateMutation.isPending;
    const actionLoading = toggleMutation.isPending ? toggleMutation.variables?.id : null;


    useEffect(() => {
        setPageTitle('User Management');
    }, [setPageTitle]);

    const resetForm = () => {
        setFormData({ name: '', email: '', password: '', role: 'production_manager', factory_id: '' });
        setIsEditMode(false);
        setSelectedUserId(null);
        setFormError(null);
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        setFormError(null);

        // Prepare data
        const payload = { ...formData };
        if (payload.factory_id === '') payload.factory_id = null;

        if (isEditMode) {
            // For update, exclude email and password if empty
            const updatePayload = {
                name: payload.name,
                factory_id: payload.factory_id, // include factory_id for updates
            };
            // Note: API might not support email/password update here depending on implementation
            // Checking API, update supports name and factory_id.
            updateMutation.mutate({ id: selectedUserId, data: updatePayload });
        } else {
            createMutation.mutate(payload);
        }
    };

    const handleEdit = (user) => {
        setIsEditMode(true);
        setSelectedUserId(user.id);
        setFormData({
            name: user.name || '',
            email: user.email || '',
            password: '', // Password not editable/visible
            role: user.role,
            factory_id: user.factory_id || '',
        });
        setShowModal(true);
    };

    const getFactoryName = (factoryId) => {
        if (!factoryId) return 'All Factories';
        return factories.find(f => f.id === factoryId)?.name || 'Unknown Factory';
    };

    const handleToggleActive = async (user) => {
        toggleMutation.mutate({ id: user.id, active: user.active });
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
                    <p className="text-muted">Manage tub production managers who can access the mobile app</p>
                </div>
                <button className="btn btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
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
                            <p>No users found. Create your first tub production manager account.</p>
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
                                    <th>Factory</th>
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
                                                {user.role === 'admin' ? 'Admin' : 'Tub Production Manager'}
                                            </span>
                                        </td>
                                        <td>
                                            {user.role === 'production_manager' ? (
                                                <span className="text-sm font-medium">
                                                    {getFactoryName(user.factory_id)}
                                                </span>
                                            ) : (
                                                <span className="text-muted text-sm">—</span>
                                            )}
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
                                                        className="edit-btn"
                                                        onClick={() => handleEdit(user)}
                                                        title="Edit User"
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                                                    >
                                                        <Edit size={18} className="text-muted" />
                                                    </button>
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
                            <h2>{isEditMode ? 'Edit User' : 'Add Tub Production Manager'}</h2>
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
                                    <label className="form-label">Password {isEditMode && <span className="text-muted text-sm">(Leave blank to keep unchanged)</span>}</label>
                                    <input
                                        type="password"
                                        className="input"
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        placeholder={isEditMode ? "Enter new password to change" : "Minimum 8 characters"}
                                        minLength={8}
                                        required={!isEditMode}
                                        disabled={isEditMode} // Disable password change for now as API doesn't support it in update
                                    />
                                    {isEditMode && <p className="text-xs text-muted mt-1">Password changes are not supported directly here.</p>}
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Role</label>
                                    <select
                                        className="select"
                                        value={formData.role}
                                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                    >
                                        <option value="production_manager">Tub Production Manager</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </div>

                                {formData.role === 'production_manager' && (
                                    <div className="form-group">
                                        <label className="form-label">Assigned Factory</label>
                                        <select
                                            className="select"
                                            value={formData.factory_id}
                                            onChange={(e) => setFormData({ ...formData, factory_id: e.target.value })}
                                            required={formData.role === 'production_manager'}
                                        >
                                            <option value="">Select a factory...</option>
                                            {factories.map((factory) => (
                                                <option key={factory.id} value={factory.id}>
                                                    {factory.name} ({factory.code})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

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
                                            {isEditMode ? 'Updating...' : 'Creating...'}
                                        </>
                                    ) : (
                                        isEditMode ? 'Update User' : 'Create User'
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
