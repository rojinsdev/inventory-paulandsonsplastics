import { supabase } from '../../config/supabase';

export interface CreateMachineDTO {
    name: string;
    type: 'extruder' | 'cutting' | 'printing' | 'packing';
    category: 'small' | 'large' | 'other';
    max_die_weight?: number;
    daily_running_cost: number;
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

    async getAllMachines() {
        const { data: machines, error } = await supabase
            .from('machines')
            .select('*')
            .order('created_at', { ascending: true });

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
