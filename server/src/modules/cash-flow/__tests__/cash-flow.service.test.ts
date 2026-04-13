import { CashFlowService } from '../cash-flow.service';
import { supabase } from '../../../config/supabase';

jest.mock('../../../core/eventBus', () => ({
    eventBus: { emit: jest.fn() },
}));

// Mock the module
jest.mock('../../../config/supabase', () => ({
    supabase: {
        from: jest.fn()
    }
}));

describe('CashFlowService - Shared Costs', () => {
    let service: CashFlowService;
    let mockFrom: any;

    // Helper to create a chainable mock response
    const createChain = (data: any, error: any = null) => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data, error }),
        insert: jest.fn().mockResolvedValue({ error }),
        then: function (resolve: any) { resolve({ data, error }); }
    });

    beforeEach(() => {
        service = new CashFlowService();
        jest.clearAllMocks();
        // Access the mocked function directly from the imported module
        mockFrom = supabase.from;
    });

    it('should calculate shared cost split correctly', async () => {
        // Setup mocks for the sequence of calls
        mockFrom.mockImplementation((table: string) => {
            if (table === 'cash_flow_categories') {
                return {
                    select: jest.fn().mockReturnThis(),
                    eq: jest.fn().mockReturnThis(),
                    single: jest.fn().mockResolvedValue({
                        data: { is_shared: true },
                        error: null
                    })
                };
            }
            if (table === 'factories') {
                return {
                    select: jest.fn().mockResolvedValue({
                        data: [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }, { id: 'f4' }],
                        error: null
                    })
                };
            }
            if (table === 'cash_flow_logs') {
                return {
                    insert: jest.fn().mockReturnValue({
                        select: jest.fn().mockResolvedValue({
                            data: [
                                {
                                    id: 'log-1',
                                    date: '2026-01-01',
                                    category_id: 'cat-shared',
                                    factory_id: 'f1',
                                    amount: 250,
                                    payment_mode: 'Cash',
                                    reference_id: null,
                                    notes: '(Shared Cost Split)',
                                    is_automatic: false,
                                    cash_flow_categories: { name: 'Test' },
                                },
                                {
                                    id: 'log-2',
                                    date: '2026-01-01',
                                    category_id: 'cat-shared',
                                    factory_id: 'f2',
                                    amount: 250,
                                    payment_mode: 'Cash',
                                    reference_id: null,
                                    notes: '(Shared Cost Split)',
                                    is_automatic: false,
                                    cash_flow_categories: { name: 'Test' },
                                },
                                {
                                    id: 'log-3',
                                    date: '2026-01-01',
                                    category_id: 'cat-shared',
                                    factory_id: 'f3',
                                    amount: 250,
                                    payment_mode: 'Cash',
                                    reference_id: null,
                                    notes: '(Shared Cost Split)',
                                    is_automatic: false,
                                    cash_flow_categories: { name: 'Test' },
                                },
                                {
                                    id: 'log-4',
                                    date: '2026-01-01',
                                    category_id: 'cat-shared',
                                    factory_id: 'f4',
                                    amount: 250,
                                    payment_mode: 'Cash',
                                    reference_id: null,
                                    notes: '(Shared Cost Split)',
                                    is_automatic: false,
                                    cash_flow_categories: { name: 'Test' },
                                },
                            ],
                            error: null,
                        }),
                    }),
                };
            }
            return createChain({});
        });

        // Execute logic
        await service.logEntry({
            category_id: 'cat-shared',
            amount: 1000,
            payment_mode: 'Cash',
            factory_id: 'ignored-for-shared'
        });

        // Verify: It should have called insert on 'cash_flow_logs'
        const insertCalls = mockFrom.mock.calls.filter((call: any[]) => call[0] === 'cash_flow_logs');
        expect(insertCalls.length).toBe(1);

        // Get the mock object returned by that call
        // FIX: Add safe check to prevent TS2532
        const mockInsertResult = mockFrom.mock.results.find((r: any) => r.value && r.value.insert);
        if (!mockInsertResult) {
            throw new Error('Insert mock result not found');
        }
        const insertMock = mockInsertResult.value.insert;

        expect(insertMock).toHaveBeenCalled();
        const insertedData = insertMock.mock.calls[0][0];

        // Verify Logic: 1000 / 4 = 250
        expect(insertedData.length).toBe(4);
        expect(insertedData[0].amount).toBe(250);
        expect(insertedData[0].factory_id).toBe('f1');
        expect(insertedData[3].factory_id).toBe('f4');
        expect(insertedData[0].notes).toContain('(Shared Cost Split)');
    });
});
