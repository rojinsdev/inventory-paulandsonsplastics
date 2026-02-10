import { supabase } from '../../config/supabase';

export interface CreateMachineDTO {
    name: string;
    type: 'extruder' | 'cutting' | 'printing' | 'packing';
    category: 'small' | 'large' | 'other';
    max_die_weight?: number | null;
    daily_running_cost: number;
    status?: 'active' | 'inactive';
    factory_id: string; // Required: which factory this machine belongs to
}

export class MachineService {
    async createMachine(data: CreateMachineDTO) {
        const { data: machine, error } = await supabase
            .from('machines')
            .insert(data)
            .select()
            .single();

        if (error) throw new Error(error.message);
        return machine;
    }

    async getAllMachines(factoryId?: string) {
        let query = supabase
            .from('machines')
            .select('*, factories(name, code)')
            .order('created_at', { ascending: true });

        // Filter by factory if provided
        if (factoryId) {
            query = query.eq('factory_id', factoryId);
        }

        const { data: machines, error } = await query;

        if (error) throw new Error(error.message);
        return machines;
    }

    async getMachineById(id: string) {
        const { data: machine, error } = await supabase
            .from('machines')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw new Error(error.message);
        return machine;
    }

    async updateMachine(id: string, data: Partial<CreateMachineDTO>) {
        const { data: machine, error } = await supabase
            .from('machines')
            .update(data)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(error.message);
        return machine;
    }

    async deleteMachine(id: string) {
        const { error } = await supabase
            .from('machines')
            .delete()
            .eq('id', id);

        if (error) throw new Error(error.message);
        return { message: 'Machine deleted successfully' };
    }
}

export const machineService = new MachineService();
