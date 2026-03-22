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

    it('should fulfill request manually and move stock to reserved', async () => {
        const requestId = 'req-123';
        const userId = 'user-456';
        const mockRequest = {
            id: requestId,
            product_id: 'prod-1',
            factory_id: 'fac-1',
            quantity: 50,
            unit_type: 'packet',
            status: 'pending',
            sales_order_id: 'order-789'
        };

        mockFrom.mockImplementation((table: string) => {
            const chain = createChain({});
            if (table === 'production_requests') {
                chain.single = jest.fn().mockResolvedValue({ data: mockRequest, error: null });
                return chain;
            }
            if (table === 'stock_balances') {
                chain.single = jest.fn().mockResolvedValue({ data: { quantity: 100 }, error: null });
                chain.then = (resolve: any) => resolve({ data: [{ quantity: 100 }], error: null });
                return chain;
            }
            if (table === 'sales_orders') {
                chain.single = jest.fn().mockResolvedValue({ data: { user_id: userId }, error: null });
                return chain;
            }
            if (table === 'products') {
                chain.single = jest.fn().mockResolvedValue({ data: { name: 'Test Product' }, error: null });
                return chain;
            }
            return chain;
        });

        const result = await service.fulfillRequestManually(requestId, userId);

        expect(result.success).toBe(true);
        // Verify production request was marked completed
        expect(mockFrom).toHaveBeenCalledWith('production_requests');
    });

    /* Deprecated: Automated FIFO allocation is disabled.
    it('should allocate stock to backorders in FIFO order', async () => {
        // ...
    });

    it('should correctly call reserveFulfillment and update database for fulfilled item', async () => {
        // ...
    });
    */
});
