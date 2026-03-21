import { resolveAuthorizedFactoryId } from '../auth';
import { AuthRequest } from '../../middleware/auth';

describe('resolveAuthorizedFactoryId', () => {
    it('should return undefined if no user is present', () => {
        const req = { query: {} } as any as AuthRequest;
        expect(resolveAuthorizedFactoryId(req)).toBeUndefined();
    });

    it('should return fixed factory_id for production_manager ignoring query', () => {
        const req = {
            user: {
                role: 'production_manager',
                factory_id: 'factory-123'
            },
            query: {
                factory_id: 'other-factory'
            }
        } as any as AuthRequest;

        expect(resolveAuthorizedFactoryId(req)).toBe('factory-123');
    });

    it('should return query factory_id for admin', () => {
        const req = {
            user: {
                role: 'admin',
                factory_id: null
            },
            query: {
                factory_id: 'query-factory'
            }
        } as any as AuthRequest;

        expect(resolveAuthorizedFactoryId(req)).toBe('query-factory');
    });

    it('should return undefined for admin if no query factory_id is provided', () => {
        const req = {
            user: {
                role: 'admin',
                factory_id: null
            },
            query: {}
        } as any as AuthRequest;

        expect(resolveAuthorizedFactoryId(req)).toBeUndefined();
    });
});
