import { Request, Response } from 'express';
import { innerService } from './inner.service';
import { AuthRequest } from '../../middleware/auth';

export class InnerController {
    async create(req: AuthRequest, res: Response) {
        try {
            const inner = await innerService.createInner(req.body);
            res.status(201).json(inner);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async list(req: Request, res: Response) {
        try {
            const factoryId = req.query.factory_id as string;
            const inners = await innerService.getAllInners(factoryId);
            res.json(inners);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async getOne(req: Request, res: Response) {
        try {
            const inner = await innerService.getInnerById(req.params.id);
            res.json(inner);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async update(req: AuthRequest, res: Response) {
        try {
            const inner = await innerService.updateInner(req.params.id, req.body);
            res.json(inner);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async delete(req: AuthRequest, res: Response) {
        try {
            await innerService.deleteInner(req.params.id);
            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async getBalances(req: Request, res: Response) {
        try {
            const factoryId = req.query.factory_id as string;
            const balances = await innerService.getInnerStockBalances(factoryId);
            res.json(balances);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    // --- Template Handlers ---

    async createTemplate(req: Request, res: Response) {
        try {
            const { colors, ...templateData } = req.body;
            const result = await innerService.createTemplateWithVariants(templateData, colors);
            res.status(201).json(result);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async listTemplates(req: Request, res: Response) {
        try {
            const factoryId = req.query.factory_id as string | undefined;
            const templates = await innerService.getTemplates(factoryId);
            res.json(templates);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async getTemplate(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const template = await innerService.getTemplateById(id);
            res.json(template);
        } catch (error: any) {
            res.status(404).json({ error: 'Template not found' });
        }
    }

    async updateTemplate(req: AuthRequest, res: Response) {
        try {
            const { id } = req.params;
            const template = await innerService.updateTemplate(id, req.body);
            res.json(template);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async deleteTemplate(req: AuthRequest, res: Response) {
        try {
            const { id } = req.params;
            await innerService.deleteTemplate(id);
            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
}

export const innerController = new InnerController();
