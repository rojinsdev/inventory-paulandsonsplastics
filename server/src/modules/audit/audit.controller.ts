import { Request, Response } from 'express';
import { AuditService } from './audit.service';

const auditService = new AuditService();

export const getLogs = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;

        const filters = {
            action: req.query.action as string,
            entity_type: req.query.entity_type as string,
            date_from: req.query.date_from as string,
            date_to: req.query.date_to as string,
        };

        const result = await auditService.getLogs(page, limit, filters);
        res.json(result.data); // Return just the array to match frontend expectation (or wrap if needed)
        // Frontend expects array directly based on api.js implementation for other lists, 
        // but let's check audit-logs page. It checks `Array.isArray(data)`.
        // My service returns { data, total }.
        // I should probably return `result.data`.
        // Let's verify pagination support in frontend later. For now, returning array is safest.
    } catch (error: any) {
        console.error('Error fetching audit logs:', error);
        res.status(500).json({ error: error.message });
    }
};
