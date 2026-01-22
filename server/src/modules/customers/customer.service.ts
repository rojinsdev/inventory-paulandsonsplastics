import { supabase } from '../../config/supabase';

export interface CreateCustomerDTO {
    name: string;
    phone?: string;
    type?: 'permanent' | 'seasonal' | 'other';
    notes?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    gstin?: string;
    credit_limit?: number;
    payment_terms?: 'immediate' | 'net_15' | 'net_30' | 'net_60';
    tags?: string[];
}

export interface UpdateCustomerDTO extends Partial<CreateCustomerDTO> {
    is_active?: boolean;
}

export interface CreateInteractionDTO {
    customer_id: string;
    interaction_type: 'order_placed' | 'order_delivered' | 'order_cancelled' | 'note_added' | 'profile_updated' | 'contact_made' | 'payment_received' | 'credit_limit_changed';
    description?: string;
    metadata?: Record<string, any>;
    performed_by: string;
}

export interface CustomerAnalytics {
    id: string;
    customer_id: string;
    total_orders: number;
    total_purchase_value: number;
    average_order_value: number;
    delivered_orders: number;
    delivered_value: number;
    cancelled_orders: number;
    reserved_orders: number;
    first_purchase_date: string | null;
    last_purchase_date: string | null;
    average_days_between_orders: number | null;
    days_since_last_order: number | null;
    most_purchased_product_id: string | null;
    most_purchased_product_name: string | null;
    most_purchased_product_quantity: number;
    customer_segment: 'vip' | 'regular' | 'at_risk' | 'new' | 'inactive';
    is_active: boolean;
    risk_level: 'low' | 'medium' | 'high';
    last_calculated_at: string;
}

export interface CustomerInteraction {
    id: string;
    customer_id: string;
    interaction_type: string;
    description: string | null;
    metadata: Record<string, any> | null;
    performed_by: string | null;
    created_at: string;
}

export interface CustomerProfileResponse {
    customer: any;
    analytics: CustomerAnalytics | null;
    recentOrders: any[];
    recentInteractions: CustomerInteraction[];
}

export interface PaginationOptions {
    page?: number;
    limit?: number;
}

export class CustomerService {
    async createCustomer(data: CreateCustomerDTO) {
        const { data: customer, error } = await supabase
            .from('customers')
            .insert(data)
            .select()
            .single();

        if (error) throw new Error(error.message);
        return customer;
    }

    async getAllCustomers() {
        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw new Error(error.message);
        return data;
    }

    async getCustomerById(id: string) {
        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw new Error(error.message);
        return data;
    }

    async searchCustomers(query: string) {
        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .ilike('name', `%${query}%`)
            .order('name', { ascending: true })
            .limit(20);

        if (error) throw new Error(error.message);
        return data;
    }

    async updateCustomer(id: string, data: Partial<CreateCustomerDTO>) {
        const { data: customer, error } = await supabase
            .from('customers')
            .update(data)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(error.message);
        return customer;
    }

    async deleteCustomer(id: string) {
        const { error } = await supabase
            .from('customers')
            .delete()
            .eq('id', id);

        if (error) throw new Error(error.message);
        return { message: 'Customer deleted successfully' };
    }

    // ============================================================================
    // Customer Profile & Analytics Methods
    // ============================================================================

    async getCustomerProfile(id: string): Promise<CustomerProfileResponse> {
        // Get customer basic info
        const { data: customer, error: customerError } = await supabase
            .from('customers')
            .select('*')
            .eq('id', id)
            .single();

        if (customerError) throw new Error(customerError.message);

        // Get analytics (will be calculated in real-time via trigger)
        const { data: analytics, error: analyticsError } = await supabase
            .from('customer_analytics')
            .select('*')
            .eq('customer_id', id)
            .single();

        // Get recent orders (last 10)
        const { data: recentOrders, error: ordersError } = await supabase
            .from('sales_orders')
            .select(`
                *,
                sales_order_items (
                    *,
                    products (name, size)
                )
            `)
            .eq('customer_id', id)
            .order('order_date', { ascending: false })
            .limit(10);

        // Get recent interactions (last 20)
        const { data: recentInteractions, error: interactionsError } = await supabase
            .from('customer_interactions')
            .select('*')
            .eq('customer_id', id)
            .order('created_at', { ascending: false })
            .limit(20);

        return {
            customer,
            analytics: analytics || null,
            recentOrders: recentOrders || [],
            recentInteractions: recentInteractions || []
        };
    }

    async getCustomerPurchaseHistory(id: string, options: PaginationOptions = {}) {
        const page = options.page || 1;
        const limit = options.limit || 20;
        const offset = (page - 1) * limit;

        const { data, error, count } = await supabase
            .from('sales_orders')
            .select(`
                *,
                sales_order_items (
                    *,
                    products (name, size)
                )
            `, { count: 'exact' })
            .eq('customer_id', id)
            .order('order_date', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw new Error(error.message);

        return {
            data: data || [],
            pagination: {
                page,
                limit,
                total: count || 0,
                totalPages: Math.ceil((count || 0) / limit)
            }
        };
    }

    async getCustomerAnalytics(id: string): Promise<CustomerAnalytics | null> {
        // Trigger real-time calculation
        await this.calculateCustomerAnalytics(id);

        const { data, error } = await supabase
            .from('customer_analytics')
            .select('*')
            .eq('customer_id', id)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = not found
            throw new Error(error.message);
        }

        return data || null;
    }

    async calculateCustomerAnalytics(customerId: string): Promise<void> {
        // Call the PostgreSQL function to calculate analytics
        const { error } = await supabase.rpc('calculate_customer_analytics', {
            p_customer_id: customerId
        });

        if (error) throw new Error(error.message);
    }

    // ============================================================================
    // Customer Interactions Methods
    // ============================================================================

    async addCustomerInteraction(data: CreateInteractionDTO): Promise<CustomerInteraction> {
        const { data: interaction, error } = await supabase
            .from('customer_interactions')
            .insert(data)
            .select()
            .single();

        if (error) throw new Error(error.message);
        return interaction;
    }

    async getCustomerInteractions(customerId: string, options: PaginationOptions = {}) {
        const page = options.page || 1;
        const limit = options.limit || 50;
        const offset = (page - 1) * limit;

        const { data, error, count } = await supabase
            .from('customer_interactions')
            .select('*', { count: 'exact' })
            .eq('customer_id', customerId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw new Error(error.message);

        return {
            data: data || [],
            pagination: {
                page,
                limit,
                total: count || 0,
                totalPages: Math.ceil((count || 0) / limit)
            }
        };
    }

    // ============================================================================
    // Customer Segmentation Methods
    // ============================================================================

    async getCustomersBySegment(segment: 'vip' | 'regular' | 'at_risk' | 'new' | 'inactive') {
        const { data, error } = await supabase
            .from('customers')
            .select(`
                *,
                customer_analytics (*)
            `)
            .eq('customer_analytics.customer_segment', segment)
            .order('customer_analytics.total_purchase_value', { ascending: false });

        if (error) throw new Error(error.message);
        return data || [];
    }

    async getVIPCustomers(limit: number = 50) {
        const { data, error } = await supabase
            .from('vip_customers')
            .select('*')
            .limit(limit);

        if (error) throw new Error(error.message);
        return data || [];
    }

    async getAtRiskCustomers(limit: number = 50) {
        const { data, error } = await supabase
            .from('at_risk_customers')
            .select('*')
            .limit(limit);

        if (error) throw new Error(error.message);
        return data || [];
    }

    async getCustomerStats() {
        const { data, error } = await supabase
            .from('customer_analytics')
            .select('customer_segment');

        if (error) throw new Error(error.message);

        const stats = {
            total: data?.length || 0,
            vip: data?.filter(c => c.customer_segment === 'vip').length || 0,
            regular: data?.filter(c => c.customer_segment === 'regular').length || 0,
            at_risk: data?.filter(c => c.customer_segment === 'at_risk').length || 0,
            new: data?.filter(c => c.customer_segment === 'new').length || 0,
            inactive: data?.filter(c => c.customer_segment === 'inactive').length || 0
        };

        return stats;
    }
}

export const customerService = new CustomerService();
