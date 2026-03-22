import { ProductionService, SubmitProductionDTO } from '../production.service';
import { supabase } from '../../../config/supabase';
import { SettingsService } from '../../settings/settings.service';
import { stockAllocationService } from '../../inventory/stock-allocation.service';
import { inventoryService } from '../../inventory/inventory.service';

// Mock Dependencies
jest.mock('../../../config/supabase', () => ({
    supabase: {
        from: jest.fn(),
        rpc: jest.fn().mockResolvedValue({ data: null, error: null })
    }
}));
jest.mock('../../settings/settings.service');
jest.mock('../../inventory/stock-allocation.service');
jest.mock('../../inventory/inventory.service');
jest.mock('../../audit/audit.service', () => {
    return {
        AuditService: jest.fn().mockImplementation(() => ({
            logAction: jest.fn().mockResolvedValue(true)
        }))
    };
});

describe('ProductionService', () => {
    let service: ProductionService;
    let mockFrom: any;

    const createChain = (data: any, error: any = null) => {
        const chain: any = {};
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockReturnValue(chain);
        chain.gte = jest.fn().mockReturnValue(chain);
        chain.lte = jest.fn().mockReturnValue(chain);
        chain.order = jest.fn().mockReturnValue(chain);
        chain.limit = jest.fn().mockReturnValue(chain);
        chain.single = jest.fn().mockResolvedValue({ data: Array.isArray(data) ? data[0] : data, error });
        chain.update = jest.fn().mockReturnValue(chain);
        chain.insert = jest.fn().mockReturnValue(chain);
        chain.upsert = jest.fn().mockResolvedValue({ error });
        chain.then = (resolve: any) => resolve({ data, error });
        return chain;
    };

    beforeEach(() => {
        service = new ProductionService();
        jest.clearAllMocks();
        mockFrom = supabase.from;
        (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: null });
        (SettingsService.getValue as jest.Mock).mockResolvedValue(100); // Default threshold
    });

    it('should submit production successfully and deduct raw materials', async () => {
        // Setup Data
        const input: SubmitProductionDTO = {
            machine_id: 'mach-1',
            product_id: 'prod-1',
            shift_number: 1,
            start_time: '08:00',
            end_time: '09:00',
            total_produced: 100,
            damaged_count: 5,
            actual_cycle_time_seconds: 10,
            actual_weight_grams: 50,
            user_id: 'user-1',
            downtime_reason: 'Testing downtime logic' // Added reason
        };

        const mockMachine = { id: 'mach-1', factory_id: 'fac-1', status: 'active', daily_running_cost: 1000 };
        const mockProduct = {
            id: 'prod-1',
            factory_id: 'fac-1',
            status: 'active',
            counting_method: 'unit_count',
            selling_price: 20,
            weight_grams: 50,
            raw_material_id: 'raw-1'
        };
        const mockMachineProduct = { ideal_cycle_time_seconds: 8 };
        const mockRawMaterial = { id: 'raw-1', stock_weight_kg: 1000, name: 'Plastic' };

        mockFrom.mockImplementation((table: string) => {
            if (table === 'machines') return createChain(mockMachine);
            if (table === 'products') return createChain(mockProduct);
            if (table === 'machine_products') return createChain(mockMachineProduct);
            if (table === 'production_logs') {
                if (mockFrom.mock.calls.find((c: any) => c[0] === 'production_logs' && c[1]?.method === 'select')) {
                    return createChain([]);
                }
                return createChain({ id: 'log-1' });
            }
            if (table === 'raw_materials') return createChain(mockRawMaterial);
            if (table === 'stock_balances') return createChain([{ quantity: 500 }]);
            return createChain({});
        });

        // Execute
        const result = await service.submitProduction(input);

        // Verify
        expect(result).toBeDefined();

        expect(inventoryService.logTransaction).toHaveBeenCalledWith(
            'raw_material_consumption',
            'raw-1',
            4.75,
            'kg',
            'raw_material',
            null,
            'fac-1',
            'log-1',
            undefined,
            true
        );

        /* Deprecated: Automated FIFO allocation is disabled.
        expect(stockAllocationService.allocateStock).toHaveBeenCalledWith(
            'prod-1',
            'semi_finished',
            95,
            'fac-1'
        );
        */
    });

    it('should throw error if insufficient raw material', async () => {
        const input: SubmitProductionDTO = {
            machine_id: 'mach-1',
            product_id: 'prod-1',
            shift_number: 1,
            start_time: '08:00',
            end_time: '09:00',
            total_produced: 100000,
            damaged_count: 0,
            actual_cycle_time_seconds: 10,
            actual_weight_grams: 50,
            user_id: 'user-1'
        };

        const mockMachine = { id: 'mach-1', factory_id: 'fac-1', status: 'active' };
        const mockProduct = {
            id: 'prod-1',
            factory_id: 'fac-1',
            status: 'active',
            counting_method: 'unit_count',
            weight_grams: 50,
            raw_material_id: 'raw-1'
        };
        const mockMachineProduct = { ideal_cycle_time_seconds: 8 };
        const mockRawMaterial = { id: 'raw-1', stock_weight_kg: 10, name: 'Plastic' };

        mockFrom.mockImplementation((table: string) => {
            if (table === 'machines') return createChain(mockMachine);
            if (table === 'products') return createChain(mockProduct);
            if (table === 'machine_products') return createChain(mockMachineProduct);
            if (table === 'production_logs') return createChain([]);
            if (table === 'raw_materials') return createChain(mockRawMaterial);
            return createChain({});
        });

        await expect(service.submitProduction(input)).rejects.toThrow(/Insufficient raw material/);
    });
});
