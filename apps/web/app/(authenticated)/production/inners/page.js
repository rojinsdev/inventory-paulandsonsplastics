'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUI } from '@/contexts/UIContext';
import { useFactory } from '@/contexts/FactoryContext';
import { 
    Loader2, 
    Save, 
    AlertCircle, 
    Layers, 
    Settings, 
    User, 
    Trash2, 
    Plus,
    Scale,
    Clock,
    Calculator
} from 'lucide-react';
import { innersAPI, machinesAPI, factoriesAPI } from '@/lib/api';
import { formatNumber, cn } from '@/lib/utils';
import styles from './page.module.css';

export default function InnerProductionEntryPage() {
    const queryClient = useQueryClient();
    const { setPageTitle, showNotification } = useUI();
    const { selectedFactory } = useFactory();

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        template_id: '',
        inner_id: '',
        machine_id: '',
        factory_id: selectedFactory || '',
        operator_name: '',
        gross_weight: '',
        bag_weight: '',
        waste_weight: '',
        downtime_minutes: '0',
    });

    // Queries
    const { data: templatesRes, isLoading: loadingTemplates } = useQuery({
        queryKey: ['inner-templates'],
        queryFn: () => innersAPI.getTemplates()
    });

    const { data: factoriesRes } = useQuery({
        queryKey: ['factories'],
        queryFn: () => factoriesAPI.getAll()
    });

    const { data: machinesRes } = useQuery({
        queryKey: ['machines', formData.factory_id],
        queryFn: () => machinesAPI.getAll({ factory_id: formData.factory_id }),
        enabled: !!formData.factory_id
    });

    const templates = useMemo(() => templatesRes?.data || (Array.isArray(templatesRes) ? templatesRes : []), [templatesRes]);
    const factories = useMemo(() => factoriesRes?.data || (Array.isArray(factoriesRes) ? factoriesRes : []), [factoriesRes]);
    const machines = useMemo(() => machinesRes?.data || (Array.isArray(machinesRes) ? machinesRes : []), [machinesRes]);

    const selectedTemplate = useMemo(() => 
        templates.find(t => t.id === formData.template_id),
    [templates, formData.template_id]);

    const variants = useMemo(() => selectedTemplate?.inners || [], [selectedTemplate]);

    useEffect(() => {
        setPageTitle('Inner Production Entry');
    }, [setPageTitle]);

    useEffect(() => {
        if (selectedFactory) {
            setFormData(prev => ({ ...prev, factory_id: selectedFactory }));
        }
    }, [selectedFactory]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value,
            // Reset inner_id if template changes
            ...(name === 'template_id' ? { inner_id: '' } : {})
        }));
    };

    const calculateNetWeight = () => {
        const gross = parseFloat(formData.gross_weight) || 0;
        const bag = parseFloat(formData.bag_weight) || 0;
        return Math.max(0, gross - bag);
    };

    const calculateQuantity = () => {
        if (!selectedTemplate) return 0;
        const netWeightKg = calculateNetWeight();
        const idealWeightG = parseFloat(selectedTemplate.ideal_weight_grams) || 0;
        if (idealWeightG === 0) return 0;
        return Math.floor((netWeightKg * 1000) / idealWeightG);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.inner_id || !formData.machine_id || !formData.gross_weight) {
            showNotification('Please fill all required fields', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            const netWeightKg = calculateNetWeight();
            const quantity = calculateQuantity();
            
            const payload = {
                inner_id: formData.inner_id,
                machine_id: formData.machine_id,
                factory_id: formData.factory_id,
                date: new Date().toISOString().split('T')[0],
                total_weight_produced_kg: netWeightKg,
                calculated_quantity: quantity,
                waste_weight_kg: parseFloat(formData.waste_weight) || 0,
                downtime_minutes: parseInt(formData.downtime_minutes) || 0,
                operator_name: formData.operator_name,
            };

            await innersAPI.submitProduction(payload);
            showNotification('Production log submitted successfully', 'success');
            
            // Reset form
            setFormData(prev => ({
                ...prev,
                gross_weight: '',
                bag_weight: '',
                waste_weight: '',
                downtime_minutes: '0',
            }));
            
            // Invalidate queries
            queryClient.invalidateQueries(['production-logs']);
            queryClient.invalidateQueries(['inner-balances']);
        } catch (error) {
            console.error('Error submitting production:', error);
            showNotification(error.message || 'Failed to submit production log', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loadingTemplates) {
        return (
            <div className={styles.loadingContainer}>
                <Loader2 size={40} className="animate-spin text-primary" />
                <p>Loading production data...</p>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>New Production Entry</h1>
                <p className={styles.subtitle}>Record manufactured inners and track waste metrics.</p>
            </div>

            <form onSubmit={handleSubmit} className={styles.formGrid}>
                {/* Configuration Section */}
                <div className="card h-full">
                    <div className="card-header">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <Settings size={20} className="text-primary" />
                            Production Config
                        </h2>
                    </div>
                    <div className="card-body flex flex-col gap-4">
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Factory</label>
                            <select 
                                name="factory_id" 
                                className={styles.select}
                                value={formData.factory_id}
                                onChange={handleInputChange}
                                required
                            >
                                <option value="">Select Factory</option>
                                {factories.map(f => (
                                    <option key={f.id} value={f.id}>{f.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.label}>Machine</label>
                            <select 
                                name="machine_id" 
                                className={styles.select}
                                value={formData.machine_id}
                                onChange={handleInputChange}
                                required
                            >
                                <option value="">Select Machine</option>
                                {machines.map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.label}>Inner Template</label>
                            <select 
                                name="template_id" 
                                className={styles.select}
                                value={formData.template_id}
                                onChange={handleInputChange}
                                required
                            >
                                <option value="">Select Template</option>
                                {templates.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.label}>Color Variant</label>
                            <select 
                                name="inner_id" 
                                className={styles.select}
                                value={formData.inner_id}
                                onChange={handleInputChange}
                                required
                                disabled={!formData.template_id}
                            >
                                <option value="">Select Color</option>
                                {variants.map(v => (
                                    <option key={v.id} value={v.id}>{v.color}</option>
                                ))}
                            </select>
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.label}>Operator Name</label>
                            <div className="relative">
                                <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <input 
                                    name="operator_name"
                                    type="text" 
                                    className={cn(styles.input, "pl-10")}
                                    placeholder="Enter operator name"
                                    value={formData.operator_name}
                                    onChange={handleInputChange}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Metrics Section */}
                <div className="card h-full">
                    <div className="card-header">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <Scale size={20} className="text-primary" />
                            Weight & Production
                        </h2>
                    </div>
                    <div className="card-body flex flex-col gap-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Gross Weight (kg)</label>
                                <input 
                                    name="gross_weight"
                                    type="number" 
                                    step="0.001"
                                    className={styles.input}
                                    placeholder="0.000"
                                    value={formData.gross_weight}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Bag Weight (kg)</label>
                                <input 
                                    name="bag_weight"
                                    type="number" 
                                    step="0.001"
                                    className={styles.input}
                                    placeholder="0.000"
                                    value={formData.bag_weight}
                                    onChange={handleInputChange}
                                />
                            </div>
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.label}>Waste Weight (kg)</label>
                            <input 
                                name="waste_weight"
                                type="number" 
                                step="0.001"
                                className={styles.input}
                                placeholder="0.000"
                                value={formData.waste_weight}
                                onChange={handleInputChange}
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.label}>Downtime (Minutes)</label>
                            <div className="relative">
                                <Clock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <input 
                                    name="downtime_minutes"
                                    type="number" 
                                    className={cn(styles.input, "pl-10")}
                                    value={formData.downtime_minutes}
                                    onChange={handleInputChange}
                                />
                            </div>
                        </div>

                        {/* Calculated Results */}
                        <div className={styles.calculationBox}>
                            <div className={styles.calcHeader}>
                                <Calculator size={16} />
                                <span>Calculated Output</span>
                            </div>
                            <div className={styles.calcGrid}>
                                <div className={styles.calcItem}>
                                    <span className={styles.calcLabel}>Net Weight</span>
                                    <span className={styles.calcValue}>{formatNumber(calculateNetWeight(), 3)} kg</span>
                                </div>
                                <div className={styles.calcItem}>
                                    <span className={styles.calcLabel}>Estimated Qty</span>
                                    <span className={cn(styles.calcValue, styles.primaryValue)}>
                                        {formatNumber(calculateQuantity())} Units
                                    </span>
                                </div>
                            </div>
                        </div>

                        <button 
                            type="submit" 
                            className={cn("btn btn-primary w-full mt-auto", isSubmitting && "opacity-70")}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    <span>Submitting...</span>
                                </>
                            ) : (
                                <>
                                    <Save size={18} />
                                    <span>Submit Production Log</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}
