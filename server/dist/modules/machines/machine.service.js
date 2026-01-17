"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.machineService = exports.MachineService = void 0;
const supabase_1 = require("../../config/supabase");
class MachineService {
    async createMachine(data) {
        const { data: machine, error } = await supabase_1.supabase
            .from('machines')
            .insert(data)
            .select()
            .single();
        if (error)
            throw new Error(error.message);
        return machine;
    }
    async getAllMachines() {
        const { data: machines, error } = await supabase_1.supabase
            .from('machines')
            .select('*')
            .order('created_at', { ascending: true });
        if (error)
            throw new Error(error.message);
        return machines;
    }
    async getMachineById(id) {
        const { data: machine, error } = await supabase_1.supabase
            .from('machines')
            .select('*')
            .eq('id', id)
            .single();
        if (error)
            throw new Error(error.message);
        return machine;
    }
    async updateMachine(id, data) {
        const { data: machine, error } = await supabase_1.supabase
            .from('machines')
            .update(data)
            .eq('id', id)
            .select()
            .single();
        if (error)
            throw new Error(error.message);
        return machine;
    }
    async deleteMachine(id) {
        const { error } = await supabase_1.supabase
            .from('machines')
            .delete()
            .eq('id', id);
        if (error)
            throw new Error(error.message);
        return { message: 'Machine deleted successfully' };
    }
}
exports.MachineService = MachineService;
exports.machineService = new MachineService();
