import { Router } from 'express';
import { SettingsController } from './settings.controller';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

// All settings endpoints require authentication
router.use(authenticate);

// Get all settings (grouped by category) - Available to all authenticated users
router.get('/', SettingsController.getAll);

// Get settings by category - Available to all authenticated users
router.get('/category/:category', SettingsController.getByCategory);

// Get single setting value - Available to all authenticated users
router.get('/value/:key', SettingsController.getValue);

// Update setting (Admin only)
router.patch('/:key', requireRole('admin'), SettingsController.updateValue);

// Refresh cache (Admin only)
router.post('/refresh-cache', requireRole('admin'), SettingsController.refreshCache);

export default router;
