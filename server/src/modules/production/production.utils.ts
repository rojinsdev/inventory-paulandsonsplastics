import { supabase } from '../../config/supabase';
import { AppError } from '../../utils/AppError';

export const MAIN_FACTORY_ID = '7ec2471f-c1c4-4603-9181-0cbde159420b';

/**
 * Calculate shift duration in minutes
 */
export function calculateShiftDuration(startTime: string, endTime: string, shiftNumber: number | string): number {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    let startMinutes = startHour * 60 + startMin;
    let endMinutes = endHour * 60 + endMin;

    // Handle overnight shifts (Shift 2: 8PM-8AM) - handle string/number ambiguity
    if (Number(shiftNumber) === 2 && endMinutes < startMinutes) {
        endMinutes += 24 * 60; // Add 24 hours
    }

    return endMinutes - startMinutes;
}

/**
 * Check if two time ranges overlap
 */
export function checkTimeOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
    const toMinutes = (time: string) => {
        const [h, m] = time.split(':').map(Number);
        return h * 60 + m;
    };

    const s1 = toMinutes(start1);
    const e1 = toMinutes(end1);
    const s2 = toMinutes(start2);
    const e2 = toMinutes(end2);

    return (s1 < e2 && e1 > s2);
}

/**
 * Validate no overlapping sessions for same machine on same date
 */
export async function validateNoOverlap(
    machineId: string,
    date: string,
    shiftNumber: number,
    startTime: string,
    endTime: string,
    table: 'production_logs' | 'cap_production_logs' | 'inner_production_logs' = 'production_logs'
): Promise<void> {
    const { data: existingSessions } = await supabase
        .from(table)
        .select('start_time, end_time')
        .eq('machine_id', machineId)
        .eq('date', date)
        .eq('shift_number', shiftNumber);

    if (existingSessions && existingSessions.length > 0) {
        for (const session of existingSessions) {
            const overlap = checkTimeOverlap(
                startTime, endTime,
                session.start_time, session.end_time
            );
            if (overlap) {
                throw new AppError(`Session overlaps with existing entry (${session.start_time} - ${session.end_time})`, 400);
            }
        }
    }
}

/**
 * Check Raw Material availability in a specific factory
 */
export async function checkRawMaterialAvailability(requiredKg: number, rawMaterialId: string, factoryId: string): Promise<{ sufficient: boolean; available: number }> {
    const { data: rawMaterial, error } = await supabase
        .from('raw_materials')
        .select('stock_weight_kg, name')
        .eq('id', rawMaterialId)
        .eq('factory_id', factoryId)
        .single();

    if (error || !rawMaterial) {
        throw new AppError('Raw material not found for this product in the specified factory', 404);
    }

    const available = rawMaterial.stock_weight_kg || 0;
    return {
        sufficient: available >= requiredKg,
        available
    };
}
