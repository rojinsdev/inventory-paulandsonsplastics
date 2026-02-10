import request from 'supertest';
import app from '../../../app';
import { supabase } from '../../../config/supabase';

// Mock Supabase
jest.mock('../../../config/supabase', () => ({
    supabase: {
        auth: {
            signInWithPassword: jest.fn(),
        },
        from: jest.fn(),
    },
}));

describe('Auth Integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should login successfully with valid credentials', async () => {
        // Setup Mocks
        (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
            data: {
                user: { id: 'user-123' },
                session: { access_token: 'fake-jwt', refresh_token: 'fake-refresh', expires_at: 1234567890 }
            },
            error: null
        });

        const mockSelect = jest.fn().mockReturnThis();
        const mockEq = jest.fn().mockReturnThis();
        const mockSingle = jest.fn().mockResolvedValue({
            data: { id: 'user-123', email: 'test@example.com', role: 'admin', active: true, factory_id: null },
            error: null
        });

        (supabase.from as jest.Mock).mockReturnValue({
            select: mockSelect,
            eq: mockEq,
            single: mockSingle,
            insert: jest.fn().mockResolvedValue({ error: null }) // Audit log
        });

        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'test@example.com',
                password: 'password123'
            });

        expect(res.status).toBe(200);
        expect(res.body.user.email).toBe('test@example.com');
        expect(res.body.session.access_token).toBe('fake-jwt');
    });

    it('should return 400 for invalid input', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'invalid-email',
                password: '123'
            });

        expect(res.status).toBe(400);
        expect(res.body.status).toBe('fail'); // From global error handler (Zod error)
    });

    it('should return 401 for wrong credentials', async () => {
        (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
            data: { user: null, session: null },
            error: { message: 'Invalid login credentials' }
        });

        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'test@example.com',
                password: 'wrongpassword'
            });

        expect(res.status).toBe(401);
        expect(res.body.status).toBe('fail');
        expect(res.body.message).toBe('Invalid login credentials');
    });
});
