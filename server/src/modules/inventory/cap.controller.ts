import { Request, Response } from 'express';
import { capService } from '../inventory/cap.service';
import { AuthRequest } from '../../middleware/auth';
import { resolveAuthorizedFactoryId } from '../../utils/auth';

export class CapController {
    async create(req: AuthRequest, res: Response) {
        try {
            const cap = await capService.createCap(req.body);
            res.status(201).json(cap);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async list(req: Request, res: Response) {
        try {
            const factoryId = req.query.factory_id as string;
            const caps = await capService.getAllCaps(factoryId);
            res.json(caps);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async getOne(req: Request, res: Response) {
        try {
            const cap = await capService.getCapById(req.params.id);
            res.json(cap);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async update(req: AuthRequest, res: Response) {
        try {
            const cap = await capService.updateCap(req.params.id, req.body);
            res.json(cap);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async delete(req: AuthRequest, res: Response) {
        try {
            await capService.deleteCap(req.params.id);
            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async getBalances(req: AuthRequest, res: Response) {
        try {
            const resolved = resolveAuthorizedFactoryId(req);
            const factoryId = resolved || (req.query.factory_id as string | undefined);
            const balances = await capService.getCapStockBalances(factoryId);
            res.json(balances);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    // --- Template Handlers ---

    async createTemplate(req: Request, res: Response) {
        try {
            const { colors, ...templateData } = req.body;
            if (templateData.inner_template_id === '') {
                templateData.inner_template_id = null;
            }
            const result = await capService.createTemplateWithVariants(templateData, colors);
            res.status(201).json(result);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async listTemplates(req: AuthRequest, res: Response) {
        try {
            const resolved = resolveAuthorizedFactoryId(req);
            const factoryId = resolved || (req.query.factory_id as string | undefined);
            const templates = await capService.getTemplates(factoryId);
            res.json(templates);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async getTemplate(req: AuthRequest, res: Response) {
        try {
            const { id } = req.params;
            const resolved = resolveAuthorizedFactoryId(req);
            const factoryId = resolved || (req.query.factory_id as string | undefined);
            const template = await capService.getTemplateById(id, factoryId);
            res.json(template);
        } catch (error: any) {
            res.status(404).json({ error: 'Template not found' });
        }
    }

    async updateTemplate(req: AuthRequest, res: Response) {
        try {
            const { id } = req.params;
            const template = await capService.updateTemplate(id, req.body);
            res.json(template);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async deleteTemplate(req: AuthRequest, res: Response) {
        try {
            const { id } = req.params;
            await capService.deleteTemplate(id);
            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
}

export const capController = new CapController();
