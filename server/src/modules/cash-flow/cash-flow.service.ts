import { supabase } from '../../config/supabase';
import { randomUUID } from 'crypto';
import { getPagination } from '../../utils/supabase';

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

            // Handle rounding: split equally but adjust the first factory for the remainder
            const baseAmount = Math.floor((data.amount / factories.length) * 100) / 100;
            const totalBase = Number((baseAmount * factories.length).toFixed(2));
            const remainder = Number((data.amount - totalBase).toFixed(2));

            const logs = factories.map((f, index) => ({
                date: data.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
                category_id: data.category_id,
                factory_id: f.id,
                amount: index === 0 ? Number((baseAmount + remainder).toFixed(2)) : baseAmount,
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
     * Log an internal transfer between payment modes
     */
    async logTransfer(data: { date?: string; amount: number; fromMode: string; toMode: string; notes?: string; factory_id?: string }) {
        const outCatId = await this.getCategoryId('Self Transfer (Out)', 'expense');
        const inCatId = await this.getCategoryId('Self Transfer (In)', 'income');

        const date = data.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        const transferRef = randomUUID();

        const logs = [
            {
                date,
                category_id: outCatId,
                factory_id: data.factory_id,
                amount: data.amount,
                payment_mode: data.fromMode,
                reference_id: transferRef,
                notes: `From ${data.fromMode} to ${data.toMode}${data.notes ? ': ' + data.notes : ''}`,
                is_automatic: true
            },
            {
                date,
                category_id: inCatId,
                factory_id: data.factory_id,
                amount: data.amount,
                payment_mode: data.toMode,
                reference_id: transferRef,
                notes: `To ${data.toMode} from ${data.fromMode}${data.notes ? ': ' + data.notes : ''}`,
                is_automatic: true
            }
        ];

        const { error } = await supabase
            .from('cash_flow_logs')
            .insert(logs);

        if (error) throw new Error(`Failed to log transfer: ${error.message}`);
    }

    /**
     * Get daily cash flow sheet
     */
    async getDailySheet(date: string, filters?: { factoryId?: string; page?: number; size?: number }) {
        const { from, to } = getPagination(filters?.page, filters?.size);

        let query = supabase
            .from('cash_flow_logs')
            .select(`
                *,
                cash_flow_categories(name, type, is_system, is_recurring)
            `, { count: 'exact' })
            .eq('date', date);

        if (filters?.factoryId) {
            query = query.eq('factory_id', filters.factoryId);
        }

        const { data, error, count } = await query
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) throw new Error(error.message);
        return {
            logs: data,
            pagination: {
                total: count,
                page: filters?.page || 1,
                size: filters?.size || 10
            }
        };
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
        const incomeBreakdown: Record<string, number> = {};
        const expenseBreakdown: Record<string, number> = {};
        const paymentModeBreakdown: Record<string, number> = { 'Cash': 0, 'Bank': 0, 'Cheque': 0 };

        let totalIncome = 0;
        let totalExpense = 0;

        data.forEach(log => {
            const dateStr = log.date;
            const amount = Number(log.amount);
            const type = log.cash_flow_categories?.type;
            const catName = log.cash_flow_categories?.name || 'Unknown';
            const paymentMode = log.payment_mode || 'Cash';

            if (!dailyTrends[dateStr]) dailyTrends[dateStr] = { income: 0, expense: 0 };

            // Exclude transfers from P&L Totals
            const isTransfer = catName.includes('Self Transfer');

            if (type === 'income') {
                if (!isTransfer) {
                    dailyTrends[dateStr].income += amount;
                    totalIncome += amount;
                    incomeBreakdown[catName] = (incomeBreakdown[catName] || 0) + amount;
                }
            } else {
                if (!isTransfer) {
                    dailyTrends[dateStr].expense += amount;
                    totalExpense += amount;
                    expenseBreakdown[catName] = (expenseBreakdown[catName] || 0) + amount;
                }
            }

            paymentModeBreakdown[paymentMode] = (paymentModeBreakdown[paymentMode] || 0) + (type === 'income' ? amount : -amount);
        });

        // Calculate KPIs
        const netCashFlow = totalIncome - totalExpense;
        const savingsRate = totalIncome > 0 ? (netCashFlow / totalIncome) * 100 : 0;

        // Calculate Burn Rate (Average Daily Expense)
        let daysInPeriod = 1;
        if (!params.date) {
            const year = params.year || new Date().getFullYear();
            const month = params.month || new Date().getMonth() + 1;
            const today = new Date();
            if (year === today.getFullYear() && month === today.getMonth() + 1) {
                daysInPeriod = today.getDate(); // Use current day of month for current month
            } else {
                daysInPeriod = new Date(year, month, 0).getDate(); // Use total days for past months
            }
        }
        const avgDailyExpense = totalExpense / daysInPeriod;

        // Simple Forecast for the rest of the month (only if monthly view)
        let forecast = null;
        if (!params.date) {
            const year = params.year || new Date().getFullYear();
            const month = params.month || new Date().getMonth() + 1;
            const today = new Date();
            if (year === today.getFullYear() && month === today.getMonth() + 1) {
                const totalDays = new Date(year, month, 0).getDate();
                const remainingDays = totalDays - today.getDate();
                forecast = {
                    projectedExpense: totalExpense + (avgDailyExpense * remainingDays),
                    projectedNet: netCashFlow - (avgDailyExpense * remainingDays) // Assuming income is already realized
                };
            }
        }

        return {
            totalIncome,
            totalExpense,
            netCashFlow,
            savingsRate,
            avgDailyExpense,
            forecast,
            dailyTrends: Object.entries(dailyTrends).map(([date, values]) => ({ date, ...values })),
            incomeBreakdown: Object.entries(incomeBreakdown).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
            expenseBreakdown: Object.entries(expenseBreakdown).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
            paymentModeBreakdown: Object.entries(paymentModeBreakdown).map(([name, value]) => ({ name, value })),
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
    async getBalances(factoryId?: string) {
        let query = supabase
            .from('cash_flow_logs')
            .select(`
                amount,
                payment_mode,
                cash_flow_categories(type)
            `);

        if (factoryId) {
            query = query.eq('factory_id', factoryId);
        }

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        const balances: Record<string, number> = { 'Cash': 0, 'Bank': 0, 'Cheque': 0 };

        data.forEach((log: any) => {
            const mode = log.payment_mode || 'Cash';
            const type = log.cash_flow_categories?.type;
            const amount = Number(log.amount);

            if (type === 'income') {
                balances[mode] = (balances[mode] || 0) + amount;
            } else {
                balances[mode] = (balances[mode] || 0) - amount;
            }
        });

        return Object.keys(balances).map(name => ({
            name,
            balance: balances[name]
        }));
    }
}

export const cashFlowService = new CashFlowService();
