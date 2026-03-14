import { Router } from 'express';
import { notificationController } from './notification.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

router.get('/', authenticate, notificationController.getNotifications);
router.post('/tokens', authenticate, notificationController.registerToken);

export default router;
