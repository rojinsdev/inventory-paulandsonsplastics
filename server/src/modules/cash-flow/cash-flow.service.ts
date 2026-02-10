import { supabase } from '../../config/supabase';

export interface CashFlowLogDTO {
    date?: string;
    category_id: string;
    factory_id?: string;
    amount: number;
    payment_mode: string;
    reference_id?: string;
    notes?: string;
    is_automatic?: boolean;
}

export class CashFlowService {
    /**
     * Get a category by name and type
     */
    async getCategoryId(name: string, type: 'income' | 'expense'): Promise<string> {
        const { data, error } = await supabase
            .from('cash_flow_categories')
            .select('id')
            .eq('name', name)
            .eq('type', type)
            .single();

        if (error) {
            // For automated system categories, we still might need to ensure they exist
            // but we'll mark them clearly as system categories
            const { data: newCat, error: createError } = await supabase
                .from('cash_flow_categories')
                .insert({ name, type, is_system: true })
                .select('id')
                .single();

            if (createError) throw new Error(`Failed to ensure system category '${name}': ${createError.message}`);
            return newCat.id;
        }

        return data.id;
    }

    /**
     * Log a cash flow entry
     */
    async logEntry(data: CashFlowLogDTO) {
        // Check if category is shared
        const { data: category, error: catError } = await supabase
            .from('cash_flow_categories')
            .select('is_shared')
            .eq('id', data.category_id)
            .single();

        if (catError) throw new Error(`Failed to verify category: ${catError.message}`);

        if (category.is_shared) {
            // Fetch all factories
            const { data: factories, error: factError } = await supabase
                .from('factories')
                .select('id');

            if (factError) throw new Error(`Failed to fetch factories for shared cost: ${factError.message}`);

            if (factories.length === 0) {
                throw new Error("No factories found to allocate shared cost.");
            }

            const splitAmount = Number((data.amount / factories.length).toFixed(2));
            const logs = factories.map(f => ({
                date: data.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
                category_id: data.category_id,
                factory_id: f.id,
                amount: splitAmount,
                payment_mode: data.payment_mode,
                reference_id: data.reference_id,
                notes: `${data.notes || ''} (Shared Cost Split)`.trim(),
                is_automatic: data.is_automatic || false
            }));

            const { error } = await supabase
                .from('cash_flow_logs')
                .insert(logs);

            if (error) throw new Error(`Failed to log shared cash flow entries: ${error.message}`);
        } else {
            const { error } = await supabase
                .from('cash_flow_logs')
                .insert({
                    date: data.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
                    category_id: data.category_id,
                    factory_id: data.factory_id,
                    amount: data.amount,
                    payment_mode: data.payment_mode,
                    reference_id: data.reference_id,
                    notes: data.notes,
                    is_automatic: data.is_automatic || false
                });

            if (error) throw new Error(`Failed to log cash flow entry: ${error.message}`);
        }
    }

    /**
     * Get daily cash flow sheet
     */
    async getDailySheet(date: string, factoryId?: string) {
        let query = supabase
            .from('cash_flow_logs')
            .select(`
                *,
                cash_flow_categories(name, type, is_system, is_recurring)
            `)
            .eq('date', date);

        if (factoryId) {
            query = query.eq('factory_id', factoryId);
        }

        const { data, error } = await query;
        if (error) throw new Error(error.message);
        return data;
    }

    /**
     * Get monthly summary for analytics
     */
    /**
     * Get analytics for a specific period (Month or Day)
     */
    async getPeriodAnalytics(params: { month?: number; year?: number; date?: string; factoryId?: string }) {
        let startDate: string;
        let endDate: string;

        if (params.date) {
            // Daily View
            startDate = params.date;
            endDate = params.date;
        } else {
            // Monthly View (Default)
            const year = params.year || new Date().getFullYear();
            const month = params.month || new Date().getMonth() + 1;
            startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
            endDate = new Date(year, month, 0).toISOString().split('T')[0];
        }

        let query = supabase
            .from('cash_flow_logs')
            .select(`
                *,
                cash_flow_categories(name, type)
            `)
            .gte('date', startDate)
            .lte('date', endDate);

        if (params.factoryId) {
            query = query.eq('factory_id', params.factoryId);
        }

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        // Aggregate for charts
        const dailyTrends: Record<string, { income: number; expense: number }> = {};
        const categoryBreakdown: Record<string, number> = {};
        let totalIncome = 0;
        let totalExpense = 0;

        data.forEach(log => {
            const dateStr = log.date;
            const amount = Number(log.amount);
            const type = log.cash_flow_categories?.type; // Optional chain in case of bad join
            const catName = log.cash_flow_categories?.name || 'Unknown';

            if (!dailyTrends[dateStr]) dailyTrends[dateStr] = { income: 0, expense: 0 };

            if (type === 'income') {
                dailyTrends[dateStr].income += amount;
                totalIncome += amount;
            } else {
                dailyTrends[dateStr].expense += amount;
                totalExpense += amount;
            }

            categoryBreakdown[catName] = (categoryBreakdown[catName] || 0) + amount;
        });

        // Calculate previous period for trends (Simplified: just returning 0 change for now or could implement real comparison)
        // For "Today", we could compare to "Yesterday". For "Month", to "Last Month".
        // Leaving complex trend calculation for next step if requested, keeping it simple for now.

        return {
            totalIncome,
            totalExpense,
            netCashFlow: totalIncome - totalExpense,
            dailyTrends: Object.entries(dailyTrends).map(([date, values]) => ({ date, ...values })),
            categoryBreakdown: Object.entries(categoryBreakdown).map(([name, value]) => ({ name, value })),
            transactions: data // Return raw data for frontend hourly processing
        };
    }

    /**
     * Get monthly summary for analytics (Legacy wrapper)
     */
    async getMonthlyAnalytics(month: number, year: number, factoryId?: string) {
        return this.getPeriodAnalytics({ month, year, factoryId });
    }

    /**
     * Manage Categories
     */
    async getCategories() {
        const { data, error } = await supabase
            .from('cash_flow_categories')
            .select('*')
            .order('name');
        if (error) throw new Error(error.message);
        return data;
    }

    async createCategory(data: { name: string; type: 'income' | 'expense'; is_recurring?: boolean; is_shared?: boolean; factory_id?: string; default_amount?: number; metadata?: any }) {
        const { data: category, error } = await supabase
            .from('cash_flow_categories')
            .insert({ ...data, is_system: false })
            .select()
            .single();
        if (error) throw new Error(error.message);
        return category;
    }

    async updateCategory(id: string, data: Partial<{ name: string; default_amount: number; is_recurring: boolean; is_shared: boolean }>) {
        const { data: category, error } = await supabase
            .from('cash_flow_categories')
            .update(data)
            .eq('id', id)
            .select()
            .single();
        if (error) throw new Error(error.message);
        return category;
    }

    async deleteCategory(id: string) {
        // Prevent deleting system categories
        const { data: check, error: checkError } = await supabase
            .from('cash_flow_categories')
            .select('is_system')
            .eq('id', id)
            .single();

        if (check?.is_system) {
            throw new Error("System categories cannot be deleted.");
        }

        const { error } = await supabase
            .from('cash_flow_categories')
            .delete()
            .eq('id', id);
        if (error) throw new Error(error.message);
        return true;
    }
}

export const cashFlowService = new CashFlowService();
