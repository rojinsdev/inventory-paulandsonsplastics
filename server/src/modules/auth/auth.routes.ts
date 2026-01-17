import { Router } from 'express';
import { supabase } from '../../config/supabase';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth';

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
            .select('id, email, role, active')
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
                role: profile.role,
            },
            session: {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                expires_at: data.session.expires_at,
            },
        });
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

// Logout
router.post('/logout', authenticate, async (req, res) => {
    try {
        await supabase.auth.signOut();
        res.json({ message: 'Logged out successfully' });
    } catch (error: any) {
        res.status(500).json({ error: 'Logout failed' });
    }
});

// Create user (Admin only) - TEMPORARILY DISABLED
// You need to add SUPABASE_SERVICE_ROLE_KEY to .env first
// Then uncomment this endpoint
/*
const createUserSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    role: z.enum(['admin', 'production_manager']),
});

router.post('/users', authenticate, requireRole('admin'), async (req, res) => {
    try {
        const { email, password, role } = createUserSchema.parse(req.body);

        // Create auth user
        const { data, error } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
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
                role,
                active: true,
            })
            .select()
            .single();

        if (profileError) {
            // Rollback: delete auth user
            await supabase.auth.admin.deleteUser(data.user.id);
            return res.status(400).json({
                error: 'Profile creation failed',
                message: profileError.message
            });
        }

        res.status(201).json({
            user: {
                id: profile.id,
                email: profile.email,
                role: profile.role,
                active: profile.active,
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
*/

// List users (Admin only)
router.get('/users', authenticate, requireRole('admin'), async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('id, email, role, active, created_at')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Deactivate user (Admin only)
router.patch('/users/:id/deactivate', authenticate, requireRole('admin'), async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('user_profiles')
            .update({ active: false })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to deactivate user' });
    }
});

export default router;
