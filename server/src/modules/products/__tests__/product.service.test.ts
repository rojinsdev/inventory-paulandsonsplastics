import { ProductService } from '../product.service';
import { supabase } from '../../../config/supabase';

// Mock Supabase
jest.mock('../../../config/supabase', () => ({
    supabase: {
        from: jest.fn(),
    },
}));

describe('ProductService', () => {
    let service: ProductService;
    let mockFrom: any;

    // Helper to create a chainable mock response
    const createChain = (data: any, error: any = null) => {
        const chain: any = {};
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockReturnValue(chain);
        chain.single = jest.fn().mockResolvedValue({ data, error });
        chain.update = jest.fn().mockReturnValue(chain);
        chain.insert = jest.fn().mockReturnValue(chain);
        chain.then = (resolve: any) => resolve({ data, error });
        return chain;
    };

    beforeEach(() => {
        service = new ProductService();
        jest.clearAllMocks();
        mockFrom = supabase.from;
    });

    describe('updateTemplate', () => {
        it('should update template and sync variants', async () => {
            const templateId = 'temp-123';
            const updateData = {
                name: 'Updated Template',
                size: 'Large',
                weight_grams: 50,
                raw_material_id: 'rm-1',
                cap_template_id: 'cap-1'
            };

            const mockVariants = [
                { id: 'var-1', color: 'Red' },
                { id: 'var-2', color: 'Blue' }
            ];

            mockFrom.mockImplementation((table: string) => {
                if (table === 'product_templates') {
                    return createChain({ id: templateId, ...updateData });
                }
                if (table === 'products') {
                    const chain = createChain(mockVariants);
                    // Return variants for select, then handle updates
                    chain.select = jest.fn().mockReturnValue(chain);
                    chain.eq = jest.fn().mockReturnValue(chain);
                    return chain;
                }
                return createChain({});
            });

            const result = await service.updateTemplate(templateId, updateData);

            expect(result.id).toBe(templateId);
            expect(mockFrom).toHaveBeenCalledWith('product_templates');
            expect(mockFrom).toHaveBeenCalledWith('products');
        });
    });
});
