import { Router } from 'express';
import { getLogs } from './audit.controller';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

// Only admins can view audit logs
router.get('/', authenticate, requireRole('admin'), getLogs);

export default router;
