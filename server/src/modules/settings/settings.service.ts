import { supabase } from '../../config/supabase';

export interface SystemSetting {
    id: string;
    category: string;
    key: string;
    value_text: string | null;
    value_number: number | null;
    value_boolean: boolean | null;
    value_json: any | null;
    data_type: 'text' | 'number' | 'boolean' | 'json';
    display_name: string;
    description: string | null;
    ui_input_type: string | null;
    ui_options: any | null;
    min_value: number | null;
    max_value: number | null;
    is_required: boolean;
    is_editable: boolean;
    requires_restart: boolean;
    created_at: string;
    updated_at: string;
    updated_by: string | null;
}

export interface SettingValue {
    key: string;
    value: string | number | boolean | any;
    category: string;
    display_name: string;
    description: string | null;
    data_type: string;
    is_editable: boolean;
}

export class SettingsService {
    // In-memory cache for performance
    private static cache: Map<string, any> = new Map();
    private static cacheTimestamp: number = 0;
    private static CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    /**
     * Get setting value by key
     */
    static async getValue<T = any>(key: string): Promise<T | null> {
        // Check cache first
        if (this.isCacheValid() && this.cache.has(key)) {
            return this.cache.get(key) as T;
        }

        const { data, error } = await supabase
            .from('system_settings')
            .select('*')
            .eq('key', key)
            .single();

        if (error || !data) {
            console.error(`Setting not found: ${key}`, error);
            return null;
        }

        const value = this.extractValue(data);
        this.cache.set(key, value);

        return value as T;
    }

    /**
     * Get all settings by category
     */
    static async getByCategory(category: string): Promise<SettingValue[]> {
        const { data, error } = await supabase
            .from('system_settings')
            .select('*')
            .eq('category', category)
            .order('key');

        if (error) throw error;

        return data.map(setting => ({
            key: setting.key,
            value: this.extractValue(setting),
            category: setting.category,
            display_name: setting.display_name,
            description: setting.description,
            data_type: setting.data_type,
            is_editable: setting.is_editable,
        }));
    }

    /**
     * Get all settings grouped by category
     */
    static async getAllSettings(): Promise<Record<string, SettingValue[]>> {
        const { data, error } = await supabase
            .from('system_settings')
            .select('*')
            .order('category, key');

        if (error) throw error;

        const grouped: Record<string, SettingValue[]> = {};

        data.forEach(setting => {
            if (!grouped[setting.category]) {
                grouped[setting.category] = [];
            }

            grouped[setting.category].push({
                key: setting.key,
                value: this.extractValue(setting),
                category: setting.category,
                display_name: setting.display_name,
                description: setting.description,
                data_type: setting.data_type,
                is_editable: setting.is_editable,
            });
        });

        return grouped;
    }

    /**
     * Update setting value
     */
    static async setValue(
        key: string,
        value: string | number | boolean | any,
        userId: string
    ): Promise<void> {
        // Get existing setting to determine data type
        const { data: existing, error: fetchError } = await supabase
            .from('system_settings')
            .select('*')
            .eq('key', key)
            .single();

        if (fetchError || !existing) {
            throw new Error(`Setting not found: ${key}`);
        }

        if (!existing.is_editable) {
            throw new Error(`Setting is not editable: ${key}`);
        }

        // Validate value
        this.validateValue(existing, value);

        // Build update object based on data type
        const updateData: any = {
            updated_by: userId,
        };

        // Reset all value fields
        updateData.value_text = null;
        updateData.value_number = null;
        updateData.value_boolean = null;
        updateData.value_json = null;

        // Set the appropriate field
        switch (existing.data_type) {
            case 'text':
                updateData.value_text = String(value);
                break;
            case 'number':
                updateData.value_number = Number(value);
                break;
            case 'boolean':
                updateData.value_boolean = Boolean(value);
                break;
            case 'json':
                updateData.value_json = value;
                break;
        }

        const { error } = await supabase
            .from('system_settings')
            .update(updateData)
            .eq('key', key);

        if (error) throw error;

        // Invalidate cache
        this.clearCache();
    }

    /**
     * Refresh cache
     */
    static async refreshCache(): Promise<void> {
        const { data, error } = await supabase
            .from('system_settings')
            .select('*');

        if (error) throw error;

        this.cache.clear();
        data.forEach(setting => {
            this.cache.set(setting.key, this.extractValue(setting));
        });

        this.cacheTimestamp = Date.now();
    }

    /**
     * Clear cache
     */
    static clearCache(): void {
        this.cache.clear();
        this.cacheTimestamp = 0;
    }

    /**
     * Extract value from setting record based on data type
     */
    private static extractValue(setting: SystemSetting): any {
        switch (setting.data_type) {
            case 'text':
                return setting.value_text;
            case 'number':
                return setting.value_number;
            case 'boolean':
                return setting.value_boolean;
            case 'json':
                return setting.value_json;
            default:
                return null;
        }
    }

    /**
     * Check if cache is still valid
     */
    private static isCacheValid(): boolean {
        if (this.cacheTimestamp === 0) return false;
        return Date.now() - this.cacheTimestamp < this.CACHE_TTL;
    }

    /**
     * Validate value against constraints
     */
    private static validateValue(setting: SystemSetting, value: any): void {
        // Type validation
        if (setting.data_type === 'number') {
            const numValue = Number(value);
            if (isNaN(numValue)) {
                throw new Error(`Value must be a number for setting: ${setting.key}`);
            }

            if (setting.min_value !== null && numValue < setting.min_value) {
                throw new Error(
                    `Value must be at least ${setting.min_value} for setting: ${setting.key}`
                );
            }

            if (setting.max_value !== null && numValue > setting.max_value) {
                throw new Error(
                    `Value must be at most ${setting.max_value} for setting: ${setting.key}`
                );
            }
        }

        // Required validation
        if (setting.is_required && (value === null || value === undefined || value === '')) {
            throw new Error(`Value is required for setting: ${setting.key}`);
        }
    }
}
