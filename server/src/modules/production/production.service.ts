import { supabase } from '../../config/supabase';
import { AppError } from '../../utils/AppError';
import logger from '../../utils/logger';
import { SubmitProductionDTO, SubmitCapProductionDTO, SubmitInnerProductionDTO, ProductionFilters, CapProductionFilters, InnerProductionFilters } from './production.types';
import { standardProductionService } from './standard-production.service';
import { capProductionService } from './cap-production.service';
import { innerProductionService } from './inner-production.service';
import { productionRequestService } from './production-request.service';

/**
 * ProductionService Facade
 * Delegates specific production logic to specialized services
 */
export class ProductionService {
    // Standard Production
    async submitProduction(data: SubmitProductionDTO) {
        return standardProductionService.submitProduction(data);
    }

    async getProductionLogs(filters?: ProductionFilters) {
        return standardProductionService.getProductionLogs(filters);
    }

    async getDailyProduction(date: string) {
        const { data, error } = await supabase
            .from('production_logs')
            .select(`
                *,
                machines(name, category),
                products(name, size, color)
            `)
            .eq('date', date)
            .order('created_at', { ascending: true });

        if (error) {
            logger.error('Get daily production error:', error);
            throw new AppError(error.message, 500);
        }
        return data;
    }

    async getLastSessionEndTime(machineId: string, date: string, shiftNumber: number): Promise<string | null> {
        const { data, error } = await supabase
            .from('production_logs')
            .select('end_time')
            .eq('machine_id', machineId)
            .eq('date', date)
            .eq('shift_number', shiftNumber)
            .order('end_time', { ascending: false })
            .limit(1);

        if (error || !data || data.length === 0) return null;
        return data[0].end_time;
    }

    // Cap Production
    async submitCapProduction(data: SubmitCapProductionDTO) {
        return capProductionService.submitCapProduction(data);
    }

    async getCapProductionLogs(filters?: CapProductionFilters) {
        return capProductionService.getCapProductionLogs(filters);
    }

    // Inner Production
    async submitInnerProduction(data: SubmitInnerProductionDTO) {
        return innerProductionService.submitInnerProduction(data);
    }

    async getInnerProductionLogs(filters?: InnerProductionFilters) {
        return innerProductionService.getInnerProductionLogs(filters);
    }

    // Production Requests
    async getProductionRequests(factoryId?: string) {
        return productionRequestService.getProductionRequests(factoryId);
    }

    async updateProductionRequestStatus(requestId: string, status: string, userId: string) {
        return productionRequestService.updateProductionRequestStatus(requestId, status, userId);
    }
}

export const productionService = new ProductionService();
export { SubmitProductionDTO, SubmitCapProductionDTO, SubmitInnerProductionDTO };
