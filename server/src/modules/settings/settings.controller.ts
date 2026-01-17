import { Request, Response } from 'express';
import { SettingsService } from './settings.service';
import { z } from 'zod';

export class SettingsController {
    /**
     * Get all settings grouped by category
     * GET /api/settings
     */
    static async getAll(req: Request, res: Response) {
        try {
            const settings = await SettingsService.getAllSettings();
            res.json(settings);
        } catch (error: any) {
            console.error('Get all settings error:', error);
            res.status(500).json({ error: 'Failed to fetch settings' });
        }
    }

    /**
     * Get settings by category
     * GET /api/settings/category/:category
     */
    static async getByCategory(req: Request, res: Response) {
        try {
            const { category } = req.params;
            const settings = await SettingsService.getByCategory(category);
            res.json(settings);
        } catch (error: any) {
            console.error('Get category settings error:', error);
            res.status(500).json({ error: 'Failed to fetch category settings' });
        }
    }

    /**
     * Get single setting value
     * GET /api/settings/value/:key
     */
    static async getValue(req: Request, res: Response) {
        try {
            const { key } = req.params;
            const value = await SettingsService.getValue(key);

            if (value === null) {
                return res.status(404).json({ error: 'Setting not found' });
            }

            res.json({ key, value });
        } catch (error: any) {
            console.error('Get setting value error:', error);
            res.status(500).json({ error: 'Failed to fetch setting value' });
        }
    }

    /**
     * Update setting value
     * PATCH /api/settings/:key
     */
    static async updateValue(req: any, res: Response) {
        try {
            const { key } = req.params;

            const updateSchema = z.object({
                value: z.union([
                    z.string(),
                    z.number(),
                    z.boolean(),
                    z.any(), // for JSON values
                ]),
            });

            const { value } = updateSchema.parse(req.body);

            await SettingsService.setValue(key, value, req.user.id);

            res.json({
                message: 'Setting updated successfully',
                key,
                value,
            });
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ error: error.issues });
            }

            if (error.message.includes('not found')) {
                return res.status(404).json({ error: error.message });
            }

            if (error.message.includes('not editable')) {
                return res.status(403).json({ error: error.message });
            }

            if (error.message.includes('must be')) {
                return res.status(400).json({ error: error.message });
            }

            console.error('Update setting error:', error);
            res.status(500).json({ error: 'Failed to update setting' });
        }
    }

    /**
     * Refresh settings cache
     * POST /api/settings/refresh-cache
     */
    static async refreshCache(req: Request, res: Response) {
        try {
            await SettingsService.refreshCache();
            res.json({ message: 'Settings cache refreshed successfully' });
        } catch (error: any) {
            console.error('Refresh cache error:', error);
            res.status(500).json({ error: 'Failed to refresh cache' });
        }
    }
}
