import { Request, Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { notificationService } from './notification.service';
import { pushNotificationService } from './push-notification.service';

export class NotificationController {
    async getNotifications(req: Request, res: Response) {
        try {
            const factoryId = req.query.factory_id as string | undefined;
            const userId = (req as AuthRequest).user?.id;
            const notifications = await notificationService.getActiveNotifications(factoryId, userId);
            return res.json(notifications);
        } catch (error: any) {
            console.error('Error fetching notifications:', error);
            return res.status(500).json({ error: error.message || 'Failed to fetch notifications' });
        }
    }

    async registerToken(req: Request, res: Response) {
        try {
            const { token, platform } = req.body;
            const userId = (req as any).user?.id;

            if (!token || !platform) {
                return res.status(400).json({ error: 'Token and platform are required' });
            }

            if (platform !== 'android' && platform !== 'ios') {
                return res.status(400).json({ error: 'Platform must be android or ios' });
            }

            await pushNotificationService.registerToken(userId, token, platform);
            return res.status(200).json({ message: 'Token registered successfully' });
        } catch (error: any) {
            console.error('Error registering token:', error);
            return res.status(500).json({ error: error.message || 'Failed to register token' });
        }
    }
}

export const notificationController = new NotificationController();
