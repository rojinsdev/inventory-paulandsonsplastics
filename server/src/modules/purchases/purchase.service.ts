import { supabase } from '../../config/supabase';
import { inventoryService } from '../inventory/inventory.service';
import { getIsoLocalDate } from '../../utils/dateUtils';
import logger from '../../utils/logger';
import { eventBus } from '../../core/eventBus';
import { SystemEvents } from '../../core/events';

export class PurchaseService {
    async createPurchase(data: {
        supplier_id?: string;
        factory_id: string;
        purchase_date?: string;
        item_type: 'Raw Material' | 'Asset' | 'Utility' | 'Other' | 'Finished Product';
        description?: string;
        total_amount: number;
        paid_amount: number;
        balance_due: number;
        raw_material_id?: string;
        product_id?: string;
        cap_id?: string;
        packaging_unit?: 'Loose' | 'Packed' | 'Bag' | 'Bundle' | 'Box';
        unit_count?: number;
        quantity?: number;
        unit?: string;
        rate_per_kg?: number;
        created_by: string;
        payment_mode?: string;
        due_date?: string;
    }) {
        // 1. Create the purchase record
        const { data: purchase, error: pError } = await supabase
            .from('purchases')
            .insert({
                supplier_id: data.supplier_id,
                factory_id: data.factory_id,
                purchase_date: data.purchase_date || new Date().toISOString().split('T')[0],
                item_type: data.item_type,
                description: data.description,
                total_amount: data.total_amount,
                paid_amount: data.paid_amount,
                balance_due: data.balance_due,
                due_date: data.due_date,
                payment_status: data.balance_due === 0 ? 'paid' : (data.paid_amount > 0 ? 'partial' : 'pending'),
                created_by: data.created_by
            })
            .select()
            .single();

        if (pError) throw new Error(pError.message);

        // 2. Handle Inventory Adjustments
        if (data.item_type === 'Raw Material' && data.raw_material_id) {
            await inventoryService.adjustRawMaterial(data.raw_material_id, {
                quantity: data.quantity || 0,
                unit: (data.unit as 'kg' | 'bags' | 'tons') || 'kg',
                rate_per_kg: data.rate_per_kg || 0,
                reason: `Purchase ID: ${purchase.id}${data.description ? ' - ' + data.description : ''}`,
                payment_mode: 'Credit', // Use 'Credit' to skip internal cash flow logging in inventoryService
                date: data.purchase_date,
            });
        } else if (data.item_type === 'Finished Product' && data.product_id) {
            // Mapping logic for finished product stock
            let state: 'semi_finished' | 'packed' | 'finished' = 'semi_finished';
            let unitType: 'loose' | 'packet' | 'bundle' | 'bag' | 'box' = 'loose';

            switch (data.packaging_unit) {
                case 'Loose':
                    state = 'semi_finished';
                    unitType = 'loose';
                    break;
                case 'Packed':
                    state = 'packed';
                    unitType = 'packet';
                    break;
                case 'Bag':
                    state = 'finished';
                    unitType = 'bag';
                    break;
                case 'Bundle':
                    state = 'finished';
                    unitType = 'bundle';
                    break;
                case 'Box':
                    state = 'finished';
                    unitType = 'box';
                    break;
            }

            // Adjust Stock via unified RPC
            await inventoryService.adjustStock({
                product_id: data.product_id,
                cap_id: data.cap_id,
                factory_id: data.factory_id,
                state: state,
                unit_type: unitType,
                quantity: data.unit_count || 0,
                reason: `External Purchase ID: ${purchase.id}`,
                type: 'increment',
                userId: data.created_by
            });
        }

        // 3. Side Effects: Emit Event
        eventBus.emit(SystemEvents.PURCHASE_CREATED, {
            purchase_id: purchase.id,
            supplier_id: data.supplier_id,
            factory_id: data.factory_id,
            total_amount: data.total_amount,
            paid_amount: data.paid_amount,
            item_type: data.item_type,
            payment_mode: data.payment_mode || 'Cash',
            userId: data.created_by,
            description: data.description,
            purchase_date: data.purchase_date || purchase.purchase_date
        });

        // 4. Update Supplier Balance if supplier_id is provided
        if (data.supplier_id && data.balance_due > 0) {
            const { data: supplier, error: sError } = await supabase
                .from('suppliers')
                .select('balance_due')
                .eq('id', data.supplier_id)
                .single();
                
            if (!sError && supplier) {
                const newBalance = (supplier.balance_due || 0) + data.balance_due;
                await supabase
                    .from('suppliers')
                    .update({ balance_due: newBalance })
                    .eq('id', data.supplier_id);
            }
        }

        return purchase;
    }

    async getPurchases(filters: { supplier_id?: string; factory_id?: string; item_type?: string }) {
        let query = supabase
            .from('purchases')
            .select(`
                *,
                suppliers(name)
            `);
            
        if (filters.supplier_id) query = query.eq('supplier_id', filters.supplier_id);
        if (filters.factory_id) query = query.eq('factory_id', filters.factory_id);
        if (filters.item_type) query = query.eq('item_type', filters.item_type);
        
        const { data, error } = await query.order('purchase_date', { ascending: false });
        if (error) throw new Error(error.message);

        return data.map(p => ({
            ...p,
            supplier_name: (p.suppliers as any)?.name
        }));
    }

    async getPurchaseById(id: string) {
        const { data, error } = await supabase
            .from('purchases')
            .select(`
                *,
                suppliers(*)
            `)
            .eq('id', id)
            .single();
            
        if (error) throw new Error(error.message);
        return {
            ...data,
            supplier_name: (data.suppliers as any)?.name
        };
    }

    async recordPayment(data: {
        purchase_id?: string;
        supplier_id: string;
        amount: number;
        payment_date?: string;
        payment_method: string;
        notes?: string;
        factory_id: string;
        created_by: string;
    }) {
        // 1. Create the payment record
        const { data: payment, error: pyError } = await supabase
            .from('supplier_payments')
            .insert({
                supplier_id: data.supplier_id,
                purchase_id: data.purchase_id,
                factory_id: data.factory_id,
                amount: data.amount,
                payment_date: data.payment_date || new Date().toISOString().split('T')[0],
                payment_method: data.payment_method,
                notes: data.notes,
                created_by: data.created_by
            })
            .select()
            .single();

        if (pyError) throw new Error(pyError.message);

        // 2. Update Supplier Balance
        const { data: supplier, error: sError } = await supabase
            .from('suppliers')
            .select('balance_due')
            .eq('id', data.supplier_id)
            .single();
            
        if (!sError) {
            const newBalance = Math.max(0, (supplier.balance_due || 0) - data.amount);
            await supabase
                .from('suppliers')
                .update({ balance_due: newBalance })
                .eq('id', data.supplier_id);
        }

        // 3. Update Purchase balances
        if (data.purchase_id) {
            // Case A: Specific purchase targeted
            const { data: purchase, error: pError } = await supabase
                .from('purchases')
                .select('paid_amount, balance_due, total_amount')
                .eq('id', data.purchase_id)
                .single();
                
            if (!pError) {
                const newPaid = (purchase.paid_amount || 0) + data.amount;
                const newBalance = Math.max(0, (purchase.total_amount || 0) - newPaid);
                const newStatus = newBalance === 0 ? 'paid' : 'partial';
                
                await supabase
                    .from('purchases')
                    .update({ 
                        paid_amount: newPaid,
                        balance_due: newBalance,
                        payment_status: newStatus
                    })
                    .eq('id', data.purchase_id);
            }
        } else {
            // Case B: General payment - Auto-allocate FIFO
            const { data: outstandingPurchases, error: opError } = await supabase
                .from('purchases')
                .select('id, paid_amount, balance_due, total_amount')
                .eq('supplier_id', data.supplier_id)
                .gt('balance_due', 0)
                .order('purchase_date', { ascending: true })
                .order('created_at', { ascending: true });

            if (!opError && outstandingPurchases && outstandingPurchases.length > 0) {
                let remainingPayment = data.amount;
                
                for (const purchase of outstandingPurchases) {
                    if (remainingPayment <= 0) break;

                    const amountToApply = Math.min(remainingPayment, purchase.balance_due);
                    const newPaid = Number(purchase.paid_amount || 0) + amountToApply;
                    const newBalance = Math.max(0, Number(purchase.total_amount || 0) - newPaid);
                    const newStatus = newBalance === 0 ? 'paid' : 'partial';

                    await supabase
                        .from('purchases')
                        .update({
                            paid_amount: newPaid,
                            balance_due: newBalance,
                            payment_status: newStatus
                        })
                        .eq('id', purchase.id);

                    remainingPayment -= amountToApply;
                }
            }
        }

        // 4. Side Effects: Emit Event
        eventBus.emit(SystemEvents.PURCHASE_PAYMENT_RECORDED, {
            payment_id: payment.id,
            purchase_id: data.purchase_id,
            supplier_id: data.supplier_id,
            amount: data.amount,
            payment_mode: data.payment_method,
            factory_id: data.factory_id,
            userId: data.created_by,
            notes: data.notes
        });

        return payment;
    }

    async getPaymentHistory(supplierId?: string) {
        let query = supabase
            .from('supplier_payments')
            .select(`
                *,
                suppliers(id, name)
            `);
            
        if (supplierId) query = query.eq('supplier_id', supplierId);
        
        const { data, error } = await query.order('payment_date', { ascending: false });
        if (error) throw new Error(error.message);

        return data.map(p => ({
            ...p,
            supplier_name: (p.suppliers as any)?.name
        }));
    }

    /**
     * Daily check for purchase dues.
     * Generates notifications for purchases due today or tomorrow.
     */
    async checkAndUpdatePurchaseDues() {
        const today = getIsoLocalDate();
        const tomorrow = getIsoLocalDate(new Date(Date.now() + 86400000));
        
        logger.info(`[Purchase Due Check] Checking for dues on ${today} and ${tomorrow}...`);

        // Find purchases with balance > 0 and due_date in [today, tomorrow]
        const { data: duePurchases, error } = await supabase
            .from('purchases')
            .select(`
                id,
                description,
                total_amount,
                paid_amount,
                balance_due,
                due_date,
                created_by,
                suppliers(name)
            `)
            .neq('payment_status', 'paid')
            .in('due_date', [today, tomorrow]);

        if (error) {
            logger.error('[Purchase Due Check] Failed to fetch due purchases', { error: error.message });
            return { count: 0 };
        }

        if (!duePurchases || duePurchases.length === 0) {
            logger.info('[Purchase Due Check] No upcoming dues found.');
            return { count: 0 };
        }

        // Generate notifications
        const notifications = duePurchases.map(purchase => {
            const isToday = purchase.due_date === today;
            const supplierName = (purchase.suppliers as any)?.name || 'Unknown Supplier';
            const title = isToday ? '🔴 Purchase Payment Due TODAY' : '🟡 Purchase Payment Due TOMORROW';
            const message = `Payment of ₹${purchase.balance_due} for ${purchase.description || 'purchase'} from ${supplierName} is due ${isToday ? 'today' : 'tomorrow'}.`;

            return {
                user_id: purchase.created_by,
                title,
                message,
                type: 'purchase_due_alert',
                metadata: { purchase_id: purchase.id, due_date: purchase.due_date }
            };
        });

        const { error: notifyError } = await supabase
            .from('notifications')
            .insert(notifications);

        if (notifyError) {
            logger.error('[Purchase Due Check] Failed to insert notifications', { error: notifyError.message });
        } else {
            logger.info(`[Purchase Due Check] Sent ${duePurchases.length} due alerts.`);
        }

        return { count: duePurchases.length };
    }
}

export const purchaseService = new PurchaseService();
