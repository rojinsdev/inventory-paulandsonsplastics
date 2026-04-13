export interface SubmitProductionDTO {
    date?: string;
    machine_id: string;
    product_id: string;
    shift_number: 1 | 2; // 1 = 8AM-8PM, 2 = 8PM-8AM
    start_time: string; // HH:mm format
    end_time: string; // HH:mm format

    // For unit-count products
    total_produced?: number; // Gross count
    damaged_count?: number; // Defects

    // For weight-based products (caps)
    total_weight_kg?: number; // For caps

    // Actual metrics (Optional for robustness)
    actual_cycle_time_seconds?: number; // From machine display
    actual_weight_grams?: number; // Measured weight per unit

    // Downtime
    downtime_minutes?: number; // Calculated or manual
    downtime_reason?: string; // Required if > 30 mins

    user_id: string;
}

export interface SubmitCapProductionDTO {
    cap_id: string;
    machine_id: string;
    factory_id?: string;
    date: string;
    shift_number: number;
    start_time: string;
    end_time: string;
    total_weight_produced_kg?: number;
    total_produced?: number;
    actual_cycle_time_seconds?: number;
    actual_weight_grams?: number;
    downtime_minutes?: number;
    downtime_reason?: string;
    remarks?: string;
    user_id: string;
}

export interface SubmitInnerProductionDTO {
    inner_id: string;
    machine_id: string;
    factory_id?: string;
    date: string;
    shift_number: number;
    start_time: string;
    end_time: string;
    total_weight_produced_kg?: number;
    total_produced?: number;
    actual_weight_grams?: number;
    actual_cycle_time_seconds?: number;
    downtime_minutes?: number;
    downtime_reason?: string;
    remarks?: string;
    user_id: string;
}

export interface ProductionFilters {
    machine_id?: string;
    product_id?: string;
    start_date?: string;
    end_date?: string;
    factory_id?: string;
    page?: number;
    size?: number;
}

export interface CapProductionFilters {
    factory_id?: string;
    cap_id?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    size?: number;
}

export interface InnerProductionFilters {
    factory_id?: string;
    inner_id?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    size?: number;
}
