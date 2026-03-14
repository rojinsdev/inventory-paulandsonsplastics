'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUI } from '@/contexts/UIContext';
import { Save, Loader2, Package, Boxes, Info, RefreshCw, Plus, Pencil, Trash2, X, Factory } from 'lucide-react';
import { settingsAPI, productsAPI, factoriesAPI, packingRulesAPI } from '@/lib/api';
import { useGuide } from '@/contexts/GuideContext';
import CustomSelect from '@/components/ui/CustomSelect';
import toast from 'react-hot-toast';
import styles from './page.module.css';

export default function PackingRulesPage() {
    const queryClient = useQueryClient();
    const { setPageTitle } = useUI();
    const { registerGuide } = useGuide();
    const [success, setSuccess] = useState(false);


    // Recipe Management State
    const [selectedProduct, setSelectedProduct] = useState('');
    const [selectedFactory, setSelectedFactory] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingRecipe, setEditingRecipe] = useState(null);
    const [recipeFormData, setRecipeFormData] = useState({
        unit_name: 'Bag',
        has_packets: true,
        items_per_packet: 12,
        packets_per_unit: 50,
        items_per_unit: 600,
        is_default: false
    });


    const { data: products = [] } = useQuery({
        queryKey: ['products-minimal'],
        queryFn: () => productsAPI.getAll().then(res => Array.isArray(res) ? res : []),
    });

    const { data: factories = [] } = useQuery({
        queryKey: ['factories'],
        queryFn: () => factoriesAPI.getAll().then(res => Array.isArray(res) ? res : []),
    });

    const { data: recipes = [], isLoading: loadingRecipes } = useQuery({
        queryKey: ['packing-rules', selectedProduct],
        queryFn: () => packingRulesAPI.getByProduct(selectedProduct),
        enabled: !!selectedProduct
    });



    const saveRecipeMutation = useMutation({
        mutationFn: (data) => {
            if (editingRecipe) return packingRulesAPI.update(editingRecipe.id, data);
            return packingRulesAPI.create({
                ...data,
                product_id: selectedProduct,
                factory_id: products.find(p => p.id === selectedProduct)?.factory_id
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['packing-rules', selectedProduct] });
            setModalOpen(false);
            toast.success(editingRecipe ? 'Recipe updated' : 'Recipe created');
        },
        onError: (err) => toast.error('Error: ' + err.message)
    });

    const deleteRecipeMutation = useMutation({
        mutationFn: (id) => packingRulesAPI.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['packing-rules', selectedProduct] });
            toast.success('Recipe deleted');
        },
        onError: (err) => toast.error('Error: ' + err.message)
    });

    useEffect(() => {
        setPageTitle('Packing Rules');
        registerGuide({
            title: "Advanced Packing Recipes",
            description: "Define product-specific packaging recipes (Bags, Boxes, Packets).",
            logic: [
                {
                    title: "Packaging Recipes",
                    explanation: "Create unit rules for products. E.g., '10 items in a Packet, 50 Packets in a Bag'."
                }
            ],
            components: [
                {
                    name: "Product Recipe Matrix",
                    description: "Define SKU-level precision for packaging flows."
                }
            ]
        });
    }, [registerGuide, setPageTitle]);

    const handleAddRecipeLoad = () => {
        setEditingRecipe(null);
        setRecipeFormData({
            unit_name: 'Bag',
            has_packets: true,
            items_per_packet: 12,
            packets_per_unit: 50,
            items_per_unit: 600,
            is_default: recipes.length === 0,
            factory_id: products.find(p => p.id === selectedProduct)?.factory_id
        });
        setModalOpen(true);
    };

    const handleEditRecipe = (recipe) => {
        setEditingRecipe(recipe);
        setSelectedFactory(recipe.factory_id);
        setRecipeFormData({
            unit_name: recipe.unit_name,
            has_packets: recipe.has_packets,
            items_per_packet: recipe.items_per_packet || '',
            packets_per_unit: recipe.packets_per_unit || '',
            items_per_unit: recipe.items_per_unit || '',
            is_default: recipe.is_default,
            factory_id: recipe.factory_id
        });
        setModalOpen(true);
    };

    const handleDeleteRecipe = (id) => {
        if (confirm('Are you sure you want to delete this recipe?')) {
            deleteRecipeMutation.mutate(id);
        }
    };

    const handleRecipeSubmit = (e) => {
        e.preventDefault();
        
        // Calculate items_per_unit if layered
        const totalItems = recipeFormData.has_packets 
            ? Number(recipeFormData.items_per_packet) * Number(recipeFormData.packets_per_unit)
            : Number(recipeFormData.items_per_unit);

        saveRecipeMutation.mutate({
            ...recipeFormData,
            items_per_packet: recipeFormData.has_packets ? Number(recipeFormData.items_per_packet) : null,
            packets_per_unit: recipeFormData.has_packets ? Number(recipeFormData.packets_per_unit) : null,
            items_per_unit: totalItems,
            factory_id: recipeFormData.factory_id || products.find(p => p.id === selectedProduct)?.factory_id
        });
    };

    return (
        <>
            {/* Page Header */}
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Packing Rules & Recipes</h1>
                    <p className={styles.pageDescription}>
                        Configure global defaults and product-specific packaging workflows
                    </p>
                </div>
            </div>


            {/* Product Recipes Section */}
            <div className={styles.recipeSection}>
                <div className={styles.sectionHeader}>
                    <div>
                        <h2 className={styles.pageTitle} style={{ fontSize: '1.25rem' }}>Product Specific Recipes</h2>
                        <p className={styles.pageDescription}>Advanced packaging flows for specific factories</p>
                    </div>
                    {selectedProduct && (
                        <button className={styles.primaryButton} onClick={handleAddRecipeLoad}>
                            <Plus size={18} /> Add Recipe
                        </button>
                    )}
                </div>

                <div className={styles.infoCard} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Filter by Factory</label>
                        <CustomSelect
                            options={[{ value: '', label: 'All Factories' }, ...factories.map(f => ({ value: f.id, label: f.name }))]}
                            value={selectedFactory}
                            onChange={(val) => {
                                setSelectedFactory(val);
                                // If current product doesn't belong to new factory, clear it
                                if (val && selectedProduct) {
                                    const prod = products.find(p => p.id === selectedProduct);
                                    if (prod && prod.factory_id !== val) setSelectedProduct('');
                                }
                            }}
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Select Product</label>
                        <CustomSelect
                            options={products
                                .filter(p => !selectedFactory || p.factory_id === selectedFactory)
                                .map(p => ({ value: p.id, label: `${p.name} (${p.size})` }))
                            }
                            value={selectedProduct}
                            onChange={(val) => {
                                setSelectedProduct(val);
                                const prod = products.find(p => p.id === val);
                                if (prod && !selectedFactory) setSelectedFactory(prod.factory_id);
                            }}
                            placeholder="Search product..."
                        />
                    </div>
                </div>

                {!selectedProduct ? (
                    <div className={styles.emptyState} style={{ textAlign: 'center', padding: '4rem', backgroundColor: 'var(--surface)', borderRadius: '1rem', border: '1px solid var(--border)' }}>
                        <Package size={48} color="var(--text-muted)" style={{ margin: '0 auto 1rem' }} />
                        <p style={{ color: 'var(--text-muted)' }}>Select a product above to view or define specific packaging recipes.</p>
                    </div>
                ) : loadingRecipes ? (
                    <div className={styles.loading}><Loader2 size={32} className={styles.spinner} /></div>
                ) : recipes.length === 0 ? (
                    <div className={styles.emptyState} style={{ textAlign: 'center', padding: '4rem', backgroundColor: 'var(--surface)', borderRadius: '1rem', border: '1px solid var(--border)' }}>
                        <Info size={48} color="var(--text-muted)" style={{ margin: '0 auto 1rem' }} />
                        <p style={{ color: 'var(--text-muted)' }}>No specific recipes found for this product. It will use system defaults.</p>
                        <button className={styles.primaryButton} style={{ margin: '1.5rem auto 0' }} onClick={handleAddRecipeLoad}>
                            <Plus size={18} /> Define First Recipe
                        </button>
                    </div>
                ) : (
                    <div className={styles.tableContainer}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Factory</th>
                                    <th>Unit Name</th>
                                    <th>Method</th>
                                    <th style={{ textAlign: 'center' }}>Breakdown</th>
                                    <th style={{ textAlign: 'right' }}>Total Capacity</th>
                                    <th style={{ textAlign: 'center' }}>Default</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recipes.filter(r => !selectedFactory || r.factory_id === selectedFactory).map(recipe => (
                                    <tr key={recipe.id}>
                                        <td>{factories.find(f => f.id === recipe.factory_id)?.name || 'Unknown'}</td>
                                        <td style={{ fontWeight: 600 }}>{recipe.unit_name}</td>
                                        <td>
                                            <span className={styles.badge} style={{ backgroundColor: recipe.has_packets ? 'var(--indigo-50)' : 'var(--slate-100)', color: recipe.has_packets ? 'var(--indigo-600)' : 'var(--text-muted)' }}>
                                                {recipe.has_packets ? 'Layered' : 'Direct'}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            {recipe.has_packets ? (
                                                <span style={{ fontSize: '0.85rem' }}>
                                                    {recipe.packets_per_unit} × {recipe.items_per_packet}
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                            {recipe.items_per_unit} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>items</span>
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            {recipe.is_default && <span className={cn(styles.badge, styles.badgeDefault)}>Active</span>}
                                        </td>
                                        <td>
                                            <div className={styles.actionButtons} style={{ justifyContent: 'flex-end' }}>
                                                <button className={styles.iconButton} onClick={() => handleEditRecipe(recipe)} title="Edit"><Pencil size={14} /></button>
                                                <button className={cn(styles.iconButton, styles.iconButtonDanger)} onClick={() => handleDeleteRecipe(recipe.id)} title="Delete"><Trash2 size={14} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Recipe Modal */}
            {modalOpen && (
                <div className={styles.modalBackdrop} onClick={() => setModalOpen(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>{editingRecipe ? 'Edit Recipe' : 'Define New Recipe'}</h2>
                            <button className={styles.closeBtn} onClick={() => setModalOpen(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleRecipeSubmit}>
                            <div className={styles.modalBody}>
                                <div className={styles.formGrid}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Assigned Factory</label>
                                        <div className={styles.infoValue} style={{ padding: '0.75rem', backgroundColor: 'var(--slate-50)', borderRadius: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                            <Factory size={14} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                                            {factories.find(f => f.id === (recipeFormData.factory_id || products.find(p => p.id === selectedProduct)?.factory_id))?.name || 'Loading...'}
                                        </div>
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Unit Name (e.g. Bag, Box, Bundle)</label>
                                        <input
                                            type="text"
                                            className={styles.formInput}
                                            value={recipeFormData.unit_name}
                                            onChange={e => setRecipeFormData({ ...recipeFormData, unit_name: e.target.value })}
                                            required
                                            placeholder="e.g., Jumbo Bag"
                                        />
                                    </div>
                                </div>

                                <div style={{ marginTop: '1.5rem', padding: '1.25rem', backgroundColor: 'var(--slate-50)', borderRadius: '0.75rem', border: '1px solid var(--border)' }}>
                                    <label className={styles.checkGroup}>
                                        <input
                                            type="checkbox"
                                            className={styles.checkbox}
                                            checked={recipeFormData.has_packets}
                                            onChange={e => setRecipeFormData({ ...recipeFormData, has_packets: e.target.checked })}
                                        />
                                        <div>
                                            <span className={styles.formLabel} style={{ fontSize: '0.95rem' }}>Intermediate Packaging (Packets/Bundles)</span>
                                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>
                                                Enable if items are first sorted into packets before being packed into the {recipeFormData.unit_name}.
                                            </p>
                                        </div>
                                    </label>

                                    <div className={styles.formGrid} style={{ marginTop: '1.5rem' }}>
                                        {recipeFormData.has_packets && (
                                            <>
                                                <div className={styles.formGroup}>
                                                    <label className={styles.formLabel}>Items per Packet</label>
                                                    <div className={styles.inputWrapper}>
                                                        <input
                                                            type="number"
                                                            className={styles.settingInput}
                                                            value={recipeFormData.items_per_packet}
                                                            onChange={e => setRecipeFormData({ ...recipeFormData, items_per_packet: e.target.value })}
                                                            required
                                                            min="1"
                                                        />
                                                        <span className={styles.inputSuffix}>items</span>
                                                    </div>
                                                </div>
                                                <div className={styles.formGroup}>
                                                    <label className={styles.formLabel}>Packets per {recipeFormData.unit_name}</label>
                                                    <div className={styles.inputWrapper}>
                                                        <input
                                                            type="number"
                                                            className={styles.settingInput}
                                                            value={recipeFormData.packets_per_unit}
                                                            onChange={e => setRecipeFormData({ ...recipeFormData, packets_per_unit: e.target.value })}
                                                            required
                                                            min="1"
                                                        />
                                                        <span className={styles.inputSuffix}>packets</span>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                        
                                        <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
                                            <label className={styles.formLabel}>
                                                {recipeFormData.has_packets ? 'Total items in this ' + recipeFormData.unit_name : 'Direct packing items count'}
                                            </label>
                                            <div className={styles.inputWrapper} style={recipeFormData.has_packets ? { opacity: 0.8 } : {}}>
                                                <input
                                                    type="number"
                                                    className={styles.settingInput}
                                                    value={recipeFormData.has_packets ? (Number(recipeFormData.items_per_packet) * Number(recipeFormData.packets_per_unit)) : recipeFormData.items_per_unit}
                                                    onChange={e => setRecipeFormData({ ...recipeFormData, items_per_unit: e.target.value })}
                                                    readOnly={recipeFormData.has_packets}
                                                    style={recipeFormData.has_packets ? { color: 'var(--primary)', fontWeight: 'bold' } : {}}
                                                    required
                                                    min="1"
                                                />
                                                <span className={styles.inputSuffix}>items total</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                                    <label className={styles.checkGroup}>
                                        <input
                                            type="checkbox"
                                            className={styles.checkbox}
                                            checked={recipeFormData.is_default}
                                            onChange={e => setRecipeFormData({ ...recipeFormData, is_default: e.target.checked })}
                                        />
                                        <div>
                                            <span className={styles.formLabel}>Set as default for this product</span>
                                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>
                                                Mobile app will automatically suggest this {recipeFormData.unit_name} during packing.
                                            </p>
                                        </div>
                                    </label>
                                </div>

                                {/* Live Summary */}
                                <div style={{ 
                                    marginTop: '1.5rem', 
                                    padding: '1rem', 
                                    backgroundColor: 'var(--indigo-50)', 
                                    borderRadius: '0.5rem', 
                                    border: '1px solid var(--indigo-100)',
                                    color: 'var(--indigo-700)',
                                    fontSize: '0.85rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem'
                                }}>
                                    <Info size={16} />
                                    <span>
                                        <strong>Summary:</strong> {recipeFormData.has_packets 
                                            ? `This recipe packs ${recipeFormData.items_per_packet} items into packets, and ${recipeFormData.packets_per_unit} packets into one ${recipeFormData.unit_name}.`
                                            : `This recipe packs ${recipeFormData.items_per_unit} loose items directly into one ${recipeFormData.unit_name}.`}
                                    </span>
                                </div>
                            </div>
                            <div className={styles.modalFooter}>
                                <button type="button" className={styles.secondaryButton} onClick={() => setModalOpen(false)}>Cancel</button>
                                <button type="submit" className={styles.primaryButton} disabled={saveRecipeMutation.isPending}>
                                    {saveRecipeMutation.isPending ? 'Saving...' : editingRecipe ? 'Update Recipe' : 'Create Recipe'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}

// Helper for classNames
function cn(...classes) {
    return classes.filter(Boolean).join(' ');
}
