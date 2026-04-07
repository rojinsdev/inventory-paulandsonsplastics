import { PurchaseService } from '../purchase.service';
import { inventoryService } from '../../inventory/inventory.service';
import { supabase } from '../../../config/supabase';

// --- SmartMock Setup ---
const mockDB: { [table: string]: any[] } = {
    products: [],
    stock_balances: [],
    raw_materials: [],
    purchases: [],
    supplier_payments: [],
    cash_flow_logs: [],
    suppliers: [],
    inventory_transactions: []
};

// CRITICAL: jest.mock MUST be at the top level
jest.mock('../../../config/supabase', () => ({
    supabase: {
        from: jest.fn(),
        rpc: jest.fn()
    }
}));

// Mock Inventory Service partially to track calls while keeping some logic
jest.mock('../../inventory/inventory.service', () => ({
    inventoryService: {
        adjustRawMaterial: jest.fn(),
        adjustStock: jest.fn(),
        quickDefine: jest.fn(),
        logTransaction: jest.fn()
    }
}));

const clearMockDB = () => {
    Object.keys(mockDB).forEach(key => {
        mockDB[key] = [];
    });
};

const setupMocks = () => {
    clearMockDB();
    const mockedSupabase = supabase as jest.Mocked<any>;

    mockedSupabase.from.mockImplementation((table: string) => {
        const chain: any = {};
        chain._where = {};
        chain._in = null;
        chain._gt = null;
        
        const getData = () => {
            let data = [...(mockDB[table] || [])];
            for (const [col, val] of Object.entries(chain._where)) {
                data = data.filter(r => r[col] === val);
            }
            if (chain._in) {
                const { col, vals } = chain._in;
                data = data.filter(r => vals.includes(r[col]));
            }
            if (chain._gt) {
                const { col, val } = chain._gt;
                data = data.filter(r => r[col] > val);
            }
            return data;
        };

        chain.select = jest.fn(() => chain);
        chain.insert = jest.fn((data: any) => {
            const rows = Array.isArray(data) ? data : [data];
            const rowsWithIds = rows.map(r => ({
                id: r.id || `${table.slice(0, 3)}-${Math.random().toString(36).substr(2, 5)}`,
                ...r
            }));
            mockDB[table].push(...rowsWithIds);
            chain._lastInserted = rowsWithIds;
            return chain;
        });
        chain.eq = jest.fn((col, val) => {
            chain._where[col] = val;
            return chain;
        });
        chain.gt = jest.fn((col, val) => {
            chain._gt = { col, val };
            return chain;
        });
        chain.in = jest.fn((col, vals) => {
            chain._in = { col, vals };
            return chain;
        });
        chain.single = jest.fn(() => {
            chain._isSingle = true;
            return chain;
        });
        chain.maybeSingle = jest.fn(() => {
            chain._isSingle = true;
            return chain;
        });
        chain.update = jest.fn((patch: any) => {
            chain._patch = patch;
            return chain;
        });
        chain.order = jest.fn(() => chain);
        
        // Make the chain thenable so it can be awaited
        chain.then = (onFilled: any) => {
            const data = getData();
            if (chain._patch) {
                data.forEach(r => Object.assign(r, chain._patch));
            }
            
            const result = chain._isSingle 
                ? { data: data.length > 0 ? data[0] : null, error: null }
                : { data: data, error: null };
                
            return Promise.resolve(result).then(onFilled);
        };
        
        return chain;
    });

    mockedSupabase.rpc.mockImplementation((fn: string, args: any) => {
        if (fn === 'adjust_stock') {
            // Mock stock adjustment logic
            const { p_product_id, p_factory_id, p_state, p_unit_type, p_quantity, p_type } = args;
            let record = mockDB.stock_balances.find(s => 
                s.product_id === p_product_id && 
                s.factory_id === p_factory_id && 
                s.state === p_state
            );
            
            if (!record) {
                record = { product_id: p_product_id, factory_id: p_factory_id, state: p_state, loose: 0, packets: 0, bundles: 0, bags: 0, boxes: 0 };
                mockDB.stock_balances.push(record);
            }
            
            const field = p_unit_type === 'loose' ? 'loose' : (p_unit_type + 's');
            if (p_type === 'increment') record[field] += p_quantity;
            else record[field] -= p_quantity;
            
            return Promise.resolve({ data: record, error: null });
        }
        return Promise.resolve({ data: null, error: null });
    });
};

describe('Purchase & Inventory Chain Tests', () => {
    let purchaseService: PurchaseService;

    beforeEach(() => {
        jest.clearAllMocks();
        setupMocks();
        purchaseService = new PurchaseService();
    });

    it('Scenario 1: Raw Material Purchase Flow', async () => {
        // 1. Setup Supplier
        mockDB.suppliers.push({ id: 'sup-1', name: 'Raw Material Supplier', balance_due: 0 });
        mockDB.raw_materials.push({ id: 'rm-1', name: 'Plastic Resin', current_stock: 100 });

        // 2. Create Purchase
        await purchaseService.createPurchase({
            supplier_id: 'sup-1',
            factory_id: 'fact-1',
            item_type: 'Raw Material',
            raw_material_id: 'rm-1',
            quantity: 50,
            unit: 'kg',
            rate_per_kg: 100,
            total_amount: 5000,
            paid_amount: 0, // Credit purchase
            balance_due: 5000,
            created_by: 'user-1'
        });

        // 3. Verify Purchase Record
        expect(mockDB.purchases).toHaveLength(1);
        expect(mockDB.purchases[0].item_type).toBe('Raw Material');
        expect(mockDB.purchases[0].balance_due).toBe(5000);

        // 4. Verify Inventory Service Call
        expect(inventoryService.adjustRawMaterial).toHaveBeenCalledWith('rm-1', expect.objectContaining({
            quantity: 50,
            payment_mode: 'Credit' // Verified as per service implementation
        }));
    });

    it('Scenario 2: External Finished Product Purchase (Cash)', async () => {
        // 1. Setup Product
        mockDB.products.push({ id: 'prod-1', name: '100ml Tub' });
        mockDB.suppliers.push({ id: 'sup-2', name: 'External Factory', balance_due: 0 });

        // 2. Create Purchase of 10 Bundles (Finished State)
        await purchaseService.createPurchase({
            supplier_id: 'sup-2',
            factory_id: 'fact-1',
            item_type: 'Finished Product',
            product_id: 'prod-1',
            packaging_unit: 'Bundle',
            unit_count: 10,
            total_amount: 2000,
            paid_amount: 2000, // Cash purchase
            balance_due: 0,
            payment_mode: 'Cash',
            created_by: 'user-1'
        });

        // 3. Verify Stock Adjustment Call
        expect(inventoryService.adjustStock).toHaveBeenCalledWith(expect.objectContaining({
            product_id: 'prod-1',
            state: 'finished',
            unit_type: 'bundle',
            quantity: 10,
            type: 'increment'
        }));

        // 4. Verify Cash Flow Entry (via events - conceptually)
        // In this test environment, we'd check if the purchase record is marked as 'paid'
        expect(mockDB.purchases[0].payment_status).toBe('paid');
    });

    it('Scenario 3: External Finished Product Purchase (Credit)', async () => {
        // 1. Setup
        mockDB.products.push({ id: 'prod-1', name: '100ml Tub' });
        mockDB.suppliers.push({ id: 'sup-2', name: 'External Factory', balance_due: 1000 });

        // 2. Create Purchase with Balance Due
        await purchaseService.createPurchase({
            supplier_id: 'sup-2',
            factory_id: 'fact-1',
            item_type: 'Finished Product',
            product_id: 'prod-1',
            packaging_unit: 'Box',
            unit_count: 5,
            total_amount: 5000,
            paid_amount: 1000, // Partial payment
            balance_due: 4000,
            created_by: 'user-1'
        });

        // 3. Verify Purchase Record Status
        expect(mockDB.purchases[0].payment_status).toBe('partial');
        expect(mockDB.purchases[0].balance_due).toBe(4000);

        // 4. Verify Packaging Mapping
        expect(inventoryService.adjustStock).toHaveBeenCalledWith(expect.objectContaining({
            state: 'finished',
            unit_type: 'box',
            quantity: 5
        }));
    });

    it('Scenario 4: Quick Define + Purchase Integration', async () => {
        // 1. Setup
        const newProdId = 'prod-new-99';
        (inventoryService.quickDefine as jest.Mock).mockResolvedValue({ id: newProdId, name: 'Quick Product' });

        // 2. Simulate Quick Define Flow
        const newItem = await inventoryService.quickDefine({
            type: 'product',
            templateId: 'tmpl-1',
            color: 'Transparent',
            factoryId: 'fact-1'
        });

        expect(newItem.id).toBe(newProdId);

        // 3. Chain with Purchase
        await purchaseService.createPurchase({
            factory_id: 'fact-1',
            item_type: 'Finished Product',
            product_id: newItem.id,
            packaging_unit: 'Loose',
            unit_count: 500,
            total_amount: 1500,
            paid_amount: 1500,
            balance_due: 0,
            created_by: 'user-1'
        });

        // 4. Verify Stock logic for 'Loose'
        expect(inventoryService.adjustStock).toHaveBeenCalledWith(expect.objectContaining({
            state: 'semi_finished',
            unit_type: 'loose',
            quantity: 500
        }));
    });

    it('Scenario 5: General Supplier Payment & History Filtering', async () => {
        // 1. Setup
        mockDB.suppliers.push({ id: 'sup-5', name: 'General Supplier', balance_due: 10000 });

        // 2. Record general payment (no purchase_id)
        await purchaseService.recordPayment({
            supplier_id: 'sup-5',
            amount: 3000,
            payment_method: 'UPI',
            factory_id: 'fact-1',
            created_by: 'user-1'
        });

        // 3. Verify Supplier Balance
        expect(mockDB.suppliers[0].balance_due).toBe(7000);

        // 4. Verify Payment History record
        const history = await purchaseService.getPaymentHistory('sup-5');
        expect(history).toHaveLength(1);
        expect(history[0].amount).toBe(3000);
        expect(history[0].payment_method).toBe('UPI');
    });
});
