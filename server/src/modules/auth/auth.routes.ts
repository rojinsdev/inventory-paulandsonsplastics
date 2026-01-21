import { Router } from 'express';
import { supabase } from '../../config/supabase';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth';
import { AuditService } from '../audit/audit.service';

const auditService = new AuditService();

const router = Router();

// Login endpoint (no auth required)
const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = loginSchema.parse(req.body);

        // Authenticate with Supabase
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            return res.status(401).json({
                error: 'Authentication failed',
                message: error.message
            });
        }

        // Fetch user profile to get role
        console.log('🔍 Fetching profile for user ID:', data.user.id);
        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('id, email, name, role, active')
            .eq('id', data.user.id)
            .single();

        console.log('📊 Profile query result:', { profile, profileError });

        if (profileError || !profile) {
            console.error('❌ Profile fetch failed:', profileError);
            return res.status(401).json({
                error: 'Authentication failed',
                message: 'User profile not found'
            });
        }

        if (!profile.active) {
            return res.status(403).json({
                error: 'Account deactivated',
                message: 'Your account has been deactivated. Contact administrator.'
            });
        }

        // Return user data with token
        res.json({
            user: {
                id: profile.id,
                email: profile.email,
                name: profile.name,
                role: profile.role,
            },
            session: {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                expires_at: data.session.expires_at,
            },
        });

        // Log login action
        await auditService.logAction(
            profile.id,
            'login',
            'user',
            profile.id,
            { email: profile.email },
            req.ip
        );
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.issues });
        }
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Get current user (requires auth)
router.get('/me', authenticate, async (req: any, res) => {
    res.json({
        user: req.user,
    });
});

// Refresh Token
router.post('/refresh', async (req, res) => {
    try {
        const { refresh_token } = req.body;

        if (!refresh_token) {
            return res.status(400).json({ error: 'Refresh token is required' });
        }

        const { data, error } = await supabase.auth.refreshSession({
            refresh_token,
        });

        if (error) {
            return res.status(401).json({
                error: 'Token refresh failed',
                message: error.message
            });
        }

        res.json({
            session: {
                access_token: data.session?.access_token,
                refresh_token: data.session?.refresh_token,
                expires_at: data.session?.expires_at,
            },
        });
    } catch (error: any) {
        console.error('Refresh error:', error);
        res.status(500).json({ error: 'Refresh failed' });
    }
});

// Logout
router.post('/logout', authenticate, async (req, res) => {
    try {
        await supabase.auth.signOut();

        // Log logout action
        if ((req as any).user && (req as any).user.id) {
            await auditService.logAction(
                (req as any).user.id,
                'logout',
                'user',
                (req as any).user.id,
                { email: (req as any).user.email },
                req.ip
            );
        }

        res.json({ message: 'Logged out successfully' });
    } catch (error: any) {
        res.status(500).json({ error: 'Logout failed' });
    }
});

// ==================== USER MANAGEMENT (Admin Only) ====================

const createUserSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(2, 'Name is required'),
    role: z.enum(['admin', 'production_manager']).default('production_manager'),
});

// Create user (Admin only)
router.post('/users', authenticate, requireRole('admin'), async (req, res) => {
    try {
        const { email, password, name, role } = createUserSchema.parse(req.body);

        // Create auth user using Supabase Admin API
        const { data, error } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true, // Auto-confirm email
        });

        if (error) {
            return res.status(400).json({
                error: 'User creation failed',
                message: error.message
            });
        }

        // Create user profile
        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .insert({
                id: data.user.id,
                email,
                name,
                role,
                active: true,
            })
            .select()
            .single();

        if (profileError) {
            // Rollback: delete auth user if profile creation fails
            await supabase.auth.admin.deleteUser(data.user.id);
            return res.status(400).json({
                error: 'Profile creation failed',
                message: profileError.message
            });
        }

        // Log creation
        await auditService.logAction(
            (req as any).user.id,
            'create',
            'user',
            profile.id,
            { email, role, name },
            req.ip
        );

        res.status(201).json({
            user: {
                id: profile.id,
                email: profile.email,
                name: profile.name,
                role: profile.role,
                active: profile.active,
                created_at: profile.created_at,
            },
        });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.issues });
        }
        console.error('User creation error:', error);
        res.status(500).json({ error: 'User creation failed' });
    }
});

// List users (Admin only)
router.get('/users', authenticate, requireRole('admin'), async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('id, email, name, role, active, created_at, updated_at')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Get single user (Admin only)
router.get('/users/:id', authenticate, requireRole('admin'), async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('user_profiles')
            .select('id, email, name, role, active, created_at, updated_at')
            .eq('id', id)
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// Deactivate user (Admin only)
router.patch('/users/:id/deactivate', authenticate, requireRole('admin'), async (req: any, res) => {
    try {
        const { id } = req.params;

        // Prevent self-deactivation
        if (id === req.user.id) {
            return res.status(400).json({ error: 'Cannot deactivate your own account' });
        }

        const { data, error } = await supabase
            .from('user_profiles')
            .update({ active: false })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);

        // Log deactivation
        await auditService.logAction(
            (req as any).user.id,
            'update',
            'user',
            id,
            { action: 'deactivate', active: false },
            req.ip
        );
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to deactivate user' });
    }
});

// Activate user (Admin only)
router.patch('/users/:id/activate', authenticate, requireRole('admin'), async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('user_profiles')
            .update({ active: true })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);

        // Log activation
        await auditService.logAction(
            (req as any).user.id,
            'update',
            'user',
            id,
            { action: 'activate', active: true },
            req.ip
        );
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to activate user' });
    }
});

// Update user (Admin only) - for name changes
const updateUserSchema = z.object({
    name: z.string().min(2).optional(),
});

router.patch('/users/:id', authenticate, requireRole('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const updates = updateUserSchema.parse(req.body);

        const { data, error } = await supabase
            .from('user_profiles')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);

        // Log update
        await auditService.logAction(
            (req as any).user.id,
            'update',
            'user',
            id,
            updates,
            req.ip
        );
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.issues });
        }
        res.status(500).json({ error: 'Failed to update user' });
    }
});

export default router;
