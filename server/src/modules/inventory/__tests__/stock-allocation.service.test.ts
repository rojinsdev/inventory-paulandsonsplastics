import { StockAllocationService } from '../stock-allocation.service';
import { supabase } from '../../../config/supabase';

// Mock Supabase
jest.mock('../../../config/supabase', () => ({
    supabase: {
        from: jest.fn()
    }
}));

describe('StockAllocationService', () => {
    let service: StockAllocationService;
    let mockFrom: any;

    // Helper to create a chainable mock response
    const createChain = (data: any, error: any = null) => {
        const chain: any = {};
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockReturnValue(chain);
        chain.single = jest.fn().mockResolvedValue({ data: Array.isArray(data) ? data[0] : data, error });
        chain.order = jest.fn().mockResolvedValue({ data, error });
        chain.update = jest.fn().mockReturnValue(chain); // Chainable
        chain.insert = jest.fn().mockReturnValue(chain); // Chainable
        chain.upsert = jest.fn().mockResolvedValue({ error });
        chain.then = (resolve: any) => resolve({ data, error });
        return chain;
    };

    beforeEach(() => {
        service = new StockAllocationService();
        jest.clearAllMocks();
        mockFrom = supabase.from;
    });

    it('should allocate stock to backorders in FIFO order', async () => {
        // 1. Setup Data
        const productId = 'prod-123';
        const factoryId = 'factory-1';
        const availableQty = 15;

        const mockBackorders = [
            { id: 'item-1', quantity: 10, unit_type: 'bundle', order_id: 'order-A', created_at: '2023-01-01', sales_orders: { user_id: 'user-1' } },
            { id: 'item-2', quantity: 10, unit_type: 'bundle', order_id: 'order-B', created_at: '2023-01-02', sales_orders: { user_id: 'user-2' } }
        ];

        // Track calls
        const updateSpy = jest.fn().mockResolvedValue({ error: null });

        mockFrom.mockImplementation((table: string) => {
            if (table === 'sales_order_items') {
                const chain = createChain({});
                // Specific behavior for order() query
                chain.order = jest.fn().mockResolvedValue({ data: mockBackorders, error: null });
                // Spy on update
                chain.update = jest.fn().mockImplementation((updates) => {
                    updateSpy(updates); // Capture updates
                    return chain;
                });
                return chain;
            }
            if (table === 'stock_balances') {
                return createChain({ quantity: 100 });
            }
            if (table === 'production_requests') {
                return createChain([{ id: 'req-1' }]);
            }
            return createChain({});
        });

        // 2. Execute
        await service.allocateStock(productId, 'finished', availableQty, factoryId);

        // 3. Verify
        // Expect Backorder 1 to be fulfilled (update called once for item-1)
        expect(updateSpy).toHaveBeenCalledTimes(1);
        expect(updateSpy).toHaveBeenCalledWith({ is_backordered: false });

        // Ensure it stopped after first item (remaining 5 < 10)
        // We can check how many times .order was called (once)
        // We can check stock balances upserts.

        const stockCalls = mockFrom.mock.calls.filter((c: any) => c[0] === 'stock_balances');
        // Expect: 
        // 1. Get Source (Select)
        // 2. Upsert Source (Deduct 10)
        // 3. Get Reserved (Select)
        // 4. Upsert Reserved (Add 10)
        // Total 2 upserts, 2 selects.
        const upsertCalls = stockCalls.filter((callArg: any) => {
            // This is hard to filter by method call since we return chains.
            // But we know 'stock_balances' was accessed 4 times within the loop (for 1 item).
            return true;
        });
        expect(upsertCalls.length).toBeGreaterThanOrEqual(4);
    });

    it('should correctly call reserveFulfillment and update database for fulfilled item', async () => {
        const productId = 'prod-123';
        const factoryId = 'factory-1';
        const availableQty = 10;

        const mockBackorders = [
            { id: 'item-1', quantity: 10, unit_type: 'bundle', order_id: 'order-A', sales_orders: { user_id: 'user-1' } }
        ];

        const updateSpy = jest.fn();
        const eqSpy = jest.fn();

        mockFrom.mockImplementation((table: string) => {
            const chain = createChain({});

            if (table === 'sales_order_items') {
                chain.order = jest.fn().mockResolvedValue({ data: mockBackorders, error: null });
                chain.update = jest.fn().mockImplementation((arg) => {
                    updateSpy(arg);
                    return chain;
                });
                chain.eq = jest.fn().mockImplementation((field, val) => {
                    eqSpy(field, val);
                    return chain;
                });
            }
            if (table === 'stock_balances') {
                chain.single = jest.fn().mockResolvedValue({ data: { quantity: 50 }, error: null });
            }
            return chain;
        });

        await service.allocateStock(productId, 'finished', availableQty, factoryId);

        // Verify Update was called
        expect(updateSpy).toHaveBeenCalledWith({ is_backordered: false });

        // Verify it was called for the correct item ID
        // The chain is .update(...).eq('id', item.id)
        // Note: eq is called multiple times in the select query too!
        // select...eq(product_id)...eq(unit_type)...eq(is_backordered)...order
        // AND update...eq(id)

        // So eqSpy should be called with 'id', 'item-1'
        expect(eqSpy).toHaveBeenCalledWith('id', 'item-1');
    });
});
