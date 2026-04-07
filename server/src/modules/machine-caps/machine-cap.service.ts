import { supabase } from '../../config/supabase';

export interface CreateMachineCapDTO {
    machine_id: string;
    cap_template_id: string;
    ideal_cycle_time_seconds: number;
    cavity_count?: number;
    capacity_restriction?: number | null;
    enabled?: boolean;
}

export class MachineCapService {
    async createMapping(data: CreateMachineCapDTO) {
        // Check if mapping already exists
        const { data: existing } = await supabase
            .from('machine_cap_templates')
            .select('id')
            .eq('machine_id', data.machine_id)
            .eq('cap_template_id', data.cap_template_id)
            .maybeSingle();

        if (existing) {
            throw new Error('This machine-cap mapping already exists. Use update instead.');
        }

        // CRITICAL: Validate machine and template belong to same factory
        const { data: machine } = await supabase
            .from('machines')
            .select('factory_id')
            .eq('id', data.machine_id)
            .single();

        const { data: template } = await supabase
            .from('cap_templates')
            .select('factory_id')
            .eq('id', data.cap_template_id)
            .single();

        if (!machine || !template) {
            throw new Error('Invalid machine or cap template ID');
        }

        if (machine.factory_id !== template.factory_id) {
            throw new Error('Cannot map machine and cap template from different factories');
        }

        const { data: mapping, error } = await supabase
            .from('machine_cap_templates')
            .insert(data)
            .select()
            .single();

        if (error) throw new Error(error.message);
        return mapping;
    }

    async getAllMappings(factoryId?: string) {
        let query = supabase
            .from('machine_cap_templates')
            .select(`
                *,
                machines!inner(id, name, type, category, factory_id),
                cap_templates(id, name, factory_id)
            `)
            .order('created_at', { ascending: false });

        // Filter by factory if provided
        if (factoryId) {
            query = query.eq('machines.factory_id', factoryId);
        }

        const { data, error } = await query;

        if (error) throw new Error(error.message);
        return data;
    }

    async getMappingsByMachine(machineId: string) {
        const { data, error } = await supabase
            .from('machine_cap_templates')
            .select(`
                *,
                cap_templates(
                    id, name,
                    variants:caps(id, color)
                )
            `)
            .eq('machine_id', machineId)
            .order('created_at', { ascending: false });

        if (error) throw new Error(error.message);
        return data;
    }

    async getMappingsByCapTemplate(capTemplateId: string) {
        const { data, error } = await supabase
            .from('machine_cap_templates')
            .select(`
                *,
                machines(id, name, type, category, factory_id),
                cap_templates(id, name)
            `)
            .eq('cap_template_id', capTemplateId)
            .order('created_at', { ascending: false });

        if (error) throw new Error(error.message);
        return data;
    }

    async getMappingById(id: string) {
        const { data, error } = await supabase
            .from('machine_cap_templates')
            .select(`
                *,
                machines(id, name, type, category),
                cap_templates(id, name)
            `)
            .eq('id', id)
            .single();

        if (error) throw new Error(error.message);
        return data;
    }

    async updateMapping(id: string, data: Partial<CreateMachineCapDTO>) {
        const { data: mapping, error } = await supabase
            .from('machine_cap_templates')
            .update(data)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(error.message);
        return mapping;
    }

    async deleteMapping(id: string) {
        const { error } = await supabase
            .from('machine_cap_templates')
            .delete()
            .eq('id', id);

        if (error) throw new Error(error.message);
        return { message: 'Machine-cap mapping deleted successfully' };
    }
}

export const machineCapService = new MachineCapService();
