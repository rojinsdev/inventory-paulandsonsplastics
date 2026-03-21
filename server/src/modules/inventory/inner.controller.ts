import { Request, Response } from 'express';
import { innerService } from './inner.service';
import { AuthRequest } from '../../middleware/auth';

export class InnerController {
    create = async (req: AuthRequest, res: Response) => {
        try {
            const inner = await innerService.createInner(req.body);
            res.status(201).json(inner);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    list = async (req: Request, res: Response) => {
        try {
            const factoryId = req.query.factory_id as string;
            const inners = await innerService.getAllInners(factoryId);
            res.json(inners);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    getOne = async (req: Request, res: Response) => {
        try {
            const inner = await innerService.getInnerById(req.params.id);
            res.json(inner);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    update = async (req: AuthRequest, res: Response) => {
        try {
            const inner = await innerService.updateInner(req.params.id, req.body);
            res.json(inner);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    delete = async (req: AuthRequest, res: Response) => {
        try {
            await innerService.deleteInner(req.params.id);
            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    getBalances = async (req: Request, res: Response) => {
        try {
            const factoryId = req.query.factory_id as string;
            const balances = await innerService.getInnerStockBalances(factoryId);
            res.json(balances);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    createTemplate = async (req: Request, res: Response) => {
        try {
            const { colors, ...templateData } = req.body;
            const result = await innerService.createTemplateWithVariants(templateData, colors);
            res.status(201).json(result);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    listTemplates = async (req: Request, res: Response) => {
        try {
            const factoryId = req.query.factory_id as string | undefined;
            const templates = await innerService.getTemplates(factoryId);
            res.json(templates);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    getTemplate = async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const template = await innerService.getTemplateById(id);
            res.json(template);
        } catch (error: any) {
            res.status(404).json({ error: 'Template not found' });
        }
    }

    updateTemplate = async (req: AuthRequest, res: Response) => {
        try {
            const { id } = req.params;
            const template = await innerService.updateTemplate(id, req.body);
            res.json(template);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    deleteTemplate = async (req: AuthRequest, res: Response) => {
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
