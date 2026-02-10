import { supabase } from '../../config/supabase';

export interface CreateFactoryDTO {
    name: string;
    code: string;
    location?: string;
    contact_person?: string;
    contact_phone?: string;
    contact_email?: string;
    machine_count?: number;
}

export interface UpdateFactoryDTO {
    name?: string;
    code?: string;
    location?: string;
    contact_person?: string;
    contact_phone?: string;
    contact_email?: string;
    machine_count?: number;
}

export class FactoryService {
    async createFactory(data: CreateFactoryDTO) {
        // Validate unique code and name
        const { data: existing, error: checkError } = await supabase
            .from('factories')
            .select('id, code, name')
            .or(`code.eq.${data.code},name.eq.${data.name}`)
            .maybeSingle();

        if (existing) {
            if (existing.code === data.code) {
                throw new Error('Factory code already exists');
            }
            if (existing.name === data.name) {
                throw new Error('Factory name already exists');
            }
        }

        // Create factory
        const { data: factory, error } = await supabase
            .from('factories')
            .insert({
                ...data,
                active: true,
                machine_count: data.machine_count || 0,
            })
            .select()
            .single();

        if (error) throw new Error(error.message);

        // Create initial raw materials entry for this factory
        await supabase
            .from('raw_materials')
            .insert({
                name: 'Standard Plastic Granules',
                stock_weight_kg: 0,
                factory_id: factory.id,
            });

        return factory;
    }

    async getAllFactories(includeInactive: boolean = false) {
        let query = supabase
            .from('factories')
            .select('*')
            .order('created_at', { ascending: true });

        if (!includeInactive) {
            query = query.eq('active', true);
        }

        const { data: factories, error } = await query;

        if (error) throw new Error(error.message);
        return factories;
    }

    async getFactoryById(id: string) {
        const { data: factory, error } = await supabase
            .from('factories')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw new Error(error.message);
        return factory;
    }

    async getFactoryStats(id: string) {
        // Get factory details
        const factory = await this.getFactoryById(id);

        // Get machine count
        const { count: machineCount } = await supabase
            .from('machines')
            .select('*', { count: 'exact', head: true })
            .eq('factory_id', id)
            .eq('status', 'active');

        // Get product count
        const { count: productCount } = await supabase
            .from('products')
            .select('*', { count: 'exact', head: true })
            .eq('factory_id', id)
            .eq('status', 'active');

        // Get production volume (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: productionData } = await supabase
            .from('production_logs')
            .select('actual_quantity')
            .eq('factory_id', id)
            .gte('date', thirtyDaysAgo.toISOString().split('T')[0]);

        const productionVolume = productionData?.reduce((sum, log) => sum + (log.actual_quantity || 0), 0) || 0;

        // Get active production managers
        const { count: managerCount } = await supabase
            .from('user_profiles')
            .select('*', { count: 'exact', head: true })
            .eq('factory_id', id)
            .eq('role', 'production_manager')
            .eq('active', true);

        return {
            ...factory,
            stats: {
                machines: machineCount || 0,
                products: productCount || 0,
                production_volume_30d: productionVolume,
                active_managers: managerCount || 0,
            },
        };
    }

    async updateFactory(id: string, data: UpdateFactoryDTO) {
        const { data: factory, error } = await supabase
            .from('factories')
            .update(data)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(error.message);
        return factory;
    }

    async toggleFactoryStatus(id: string, active: boolean) {
        const { data: factory, error } = await supabase
            .from('factories')
            .update({ active })
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(error.message);
        return factory;
    }

    async deleteFactory(id: string) {
        // Check if factory has any data
        const { count: machineCount } = await supabase
            .from('machines')
            .select('*', { count: 'exact', head: true })
            .eq('factory_id', id);

        const { count: productCount } = await supabase
            .from('products')
            .select('*', { count: 'exact', head: true })
            .eq('factory_id', id);

        if ((machineCount || 0) > 0 || (productCount || 0) > 0) {
            throw new Error('Cannot delete factory with existing machines or products. Deactivate instead.');
        }

        const { error } = await supabase
            .from('factories')
            .delete()
            .eq('id', id);

        if (error) throw new Error(error.message);
        return { message: 'Factory deleted successfully' };
    }
}

export const factoryService = new FactoryService();
