import { supabase } from '../../config/supabase';
import type {
    DemandTrendsFilters,
    DemandTrendsResponse,
    SeasonalPatternsFilters,
    SeasonalPatternsResponse,
    RecommendationsFilters,
    RecommendationsResponse,
    ForecastsFilters,
    ForecastsResponse,
    MonthlyAggregate,
    TrendCalculation,
    StockLevel,
    RecommendationCalculation,
    ProductDemandTrend,
    MonthlyBreakdown,
} from './planning.types';

export class PlanningService {
    constructor() {
        console.log('✅ PlanningService initialized with updated query logic');
    }

    /**
     * Get demand trends for products over a specified period
     */
    async getDemandTrends(filters: DemandTrendsFilters): Promise<DemandTrendsResponse> {
        const { start_date, end_date } = this.calculateDateRange(filters);

        // Get sales data
        let query = supabase
            .from('sales_order_items')
            .select(`
                quantity_bundles,
                order_id,
                product_id,
                products!inner (
                    id,
                    name,
                    size,
                    color
                ),
                sales_orders (
                    order_date,
                    status
                )
            `)
            .not('sales_orders', 'is', null);

        if (filters.product_id) {
            query = query.eq('product_id', filters.product_id);
        }

        const { data: salesData, error } = await query;
        if (error) {
            console.error('Supabase query error:', error);
            throw new Error(error.message);
        }

        // Filter by date and status in JavaScript since Supabase nested filters can be tricky
        const filteredData = salesData?.filter((item: any) => {
            if (!item.sales_orders) return false;
            const orderDate = item.sales_orders.order_date;
            const status = item.sales_orders.status;
            return (
                orderDate >= start_date &&
                orderDate <= end_date &&
                (status === 'reserved' || status === 'delivered')
            );
        }) || [];

        // Group by product and month
        const productMap = new Map<string, ProductDemandTrend>();

        filteredData?.forEach((item: any) => {
            const productId = item.product_id;
            const product = item.products;
            const orderDate = item.sales_orders.order_date;
            const month = orderDate.substring(0, 7); // YYYY-MM

            if (!productMap.has(productId)) {
                productMap.set(productId, {
                    product_id: productId,
                    product_name: product.name,
                    product_size: product.size || '',
                    product_color: product.color || '',
                    total_sold: 0,
                    growth_rate: null,
                    trend: 'stable',
                    monthly_breakdown: [],
                    seasonal_patterns: [],
                });
            }

            const productTrend = productMap.get(productId)!;
            productTrend.total_sold += item.quantity_bundles;

            // Update monthly breakdown
            let monthData = productTrend.monthly_breakdown.find(m => m.month === month);
            if (!monthData) {
                monthData = { month, quantity: 0, orders: 0, is_spike: false };
                productTrend.monthly_breakdown.push(monthData);
            }
            monthData.quantity += item.quantity_bundles;
            monthData.orders += 1;
        });

        // Calculate growth rates and trends
        for (const productTrend of productMap.values()) {
            productTrend.monthly_breakdown.sort((a, b) => a.month.localeCompare(b.month));

            if (productTrend.monthly_breakdown.length >= 2) {
                const trendCalc = this.calculateTrend(productTrend.monthly_breakdown);
                productTrend.growth_rate = trendCalc.growth_rate;
                productTrend.trend = trendCalc.trend;
            }

            // Get seasonal patterns for this product
            const patterns = await this.getSeasonalPatternsForProduct(productTrend.product_id);
            productTrend.seasonal_patterns = patterns;

            // Mark seasonal spikes
            const avgQuantity = productTrend.total_sold / productTrend.monthly_breakdown.length;
            const stdDev = this.calculateStdDev(productTrend.monthly_breakdown.map(m => m.quantity));
            const spikeThreshold = avgQuantity + 1.5 * stdDev;

            productTrend.monthly_breakdown.forEach(m => {
                m.is_spike = m.quantity > spikeThreshold;
            });
        }

        return {
            period: filters.period || 'custom',
            start_date,
            end_date,
            products: Array.from(productMap.values()),
        };
    }

    /**
     * Get detected seasonal patterns
     */
    async getSeasonalPatterns(filters: SeasonalPatternsFilters): Promise<SeasonalPatternsResponse> {
        let query = supabase
            .from('seasonal_patterns')
            .select(`
                *,
                products (
                    name,
                    size,
                    color
                )
            `)

            .eq('is_active', filters.is_active !== undefined ? filters.is_active : true)
            .order('confidence_score', { ascending: false });

        if (filters.product_id) {
            query = query.eq('product_id', filters.product_id);
        }

        if (filters.confidence_min) {
            query = query.gte('confidence_score', filters.confidence_min);
        }

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        const patterns = data?.map((p: any) => ({
            ...p,
            product_name: p.products?.product_name || p.products?.name,
            product_size: p.products?.size,
            product_color: p.products?.color,
        })) || [];

        return { patterns };
    }

    /**
     * Get production recommendations
     */
    async getRecommendations(filters: RecommendationsFilters): Promise<RecommendationsResponse> {
        const targetMonth = filters.target_month || this.getNextMonth();

        let query = supabase
            .from('production_recommendations')
            .select(`
                *,
                products (
                    name,
                    size,
                    color
                )
            `)
            .eq('target_month', `${targetMonth}-01`)
            .order('confidence_score', { ascending: false });

        if (filters.status) {
            query = query.eq('status', filters.status);
        }

        if (filters.product_id) {
            query = query.eq('product_id', filters.product_id);
        }

        if (filters.confidence_min) {
            query = query.gte('confidence_score', filters.confidence_min);
        }

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        const recommendations = data?.map((r: any) => ({
            ...r,
            product_name: r.products?.product_name || r.products?.name,
            product_size: r.products?.size || '',
            product_color: r.products?.color || '',
            product_category: r.products?.category || '',
        })) || [];

        return {
            target_month: targetMonth,
            recommendations,
        };
    }

    /**
     * Get demand forecasts
     */
    async getForecasts(filters: ForecastsFilters): Promise<ForecastsResponse> {
        let query = supabase
            .from('demand_forecasts')
            .select(`
                *,
                products (
                    name,
                    size,
                    color
                )
            `)
            .order('forecast_date', { ascending: true });

        if (filters.product_id) {
            query = query.eq('product_id', filters.product_id);
        }

        if (filters.forecast_method) {
            query = query.eq('forecast_method', filters.forecast_method);
        }

        if (filters.start_date) {
            query = query.gte('forecast_date', filters.start_date);
        }

        if (filters.end_date) {
            query = query.lte('forecast_date', filters.end_date);
        }

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        const forecasts = data?.map((f: any) => ({
            ...f,
            product_name: f.products?.product_name || f.products?.name,
            product_size: f.products?.size || '',
            product_color: f.products?.color || '',
        })) || [];

        // Calculate accuracy summary
        const forecastsWithActuals = forecasts.filter(f => f.actual_quantity !== null);
        const avgAccuracy = forecastsWithActuals.length > 0
            ? forecastsWithActuals.reduce((sum, f) => sum + (f.accuracy_percentage || 0), 0) / forecastsWithActuals.length
            : null;

        // Group by method for comparison
        const methodMap = new Map<string, { count: number; totalAccuracy: number }>();
        forecastsWithActuals.forEach(f => {
            if (!methodMap.has(f.forecast_method)) {
                methodMap.set(f.forecast_method, { count: 0, totalAccuracy: 0 });
            }
            const methodData = methodMap.get(f.forecast_method)!;
            methodData.count++;
            methodData.totalAccuracy += f.accuracy_percentage || 0;
        });

        const byMethod = Array.from(methodMap.entries())
            .map(([method, data]) => ({
                method,
                count: data.count,
                average_accuracy: data.totalAccuracy / data.count,
            }))
            .sort((a, b) => b.average_accuracy - a.average_accuracy);

        return {
            forecasts,
            accuracy_summary: {
                total_forecasts: forecasts.length,
                forecasts_with_actuals: forecastsWithActuals.length,
                average_accuracy: avgAccuracy,
                by_method: byMethod,
            },
        };
    }

    /**
     * Generate recommendations for a specific month
     */
    async generateRecommendations(targetMonth: string): Promise<void> {
        // Get all products
        const { data: products, error: productsError } = await supabase
            .from('products')
            .select('id, product_name, name');

        if (productsError) throw new Error(productsError.message);

        const targetDate = new Date(`${targetMonth}-01`);

        for (const product of products || []) {
            try {
                const recommendation = await this.calculateRecommendation(product.id, targetDate);

                // Save recommendation
                await supabase.from('production_recommendations').upsert({
                    product_id: product.id,
                    target_month: `${targetMonth}-01`,
                    recommended_quantity: recommendation.final_recommendation,
                    current_stock_level: recommendation.stock_adjustment,
                    average_monthly_sales: recommendation.baseline_quantity,
                    trend_adjustment_percentage: recommendation.trend_adjustment,
                    seasonal_adjustment_percentage: (recommendation.seasonal_multiplier - 1) * 100,
                    reasoning: recommendation.reasoning,
                    confidence_score: recommendation.confidence_score,
                    status: 'pending',
                }, {
                    onConflict: 'product_id,target_month',
                });
            } catch (err) {
                console.error(`Failed to generate recommendation for product ${product.id}:`, err);
            }
        }
    }

    /**
     * Calculate recommendation for a specific product and month
     */
    private async calculateRecommendation(
        productId: string,
        targetMonth: Date
    ): Promise<RecommendationCalculation> {
        // Get historical sales (last 6 months for baseline, 12 for trend)
        const last6Months = await this.getMonthlySalesData(productId, 6);
        const last12Months = await this.getMonthlySalesData(productId, 12);

        // Calculate baseline (average of last 6 months)
        const baseline = last6Months.length > 0
            ? last6Months.reduce((sum, m) => sum + m.quantity, 0) / last6Months.length
            : 0;

        // Calculate trend
        const trendCalc = this.calculateTrend(last12Months.map(m => ({
            month: m.month,
            quantity: m.quantity,
            orders: m.orders,
            is_spike: false,
        })));

        // Get seasonal pattern for target month
        const seasonalPattern = await this.getSeasonalPatternForMonth(productId, targetMonth);
        const seasonalMultiplier = seasonalPattern?.demand_multiplier || 1.0;

        // Get current stock
        const stock = await this.getCurrentStock(productId);
        const totalStock = stock.finished + stock.packed;

        // Calculate final recommendation
        let recommendedQty = baseline;
        recommendedQty *= (1 + trendCalc.growth_rate / 100); // Apply trend
        recommendedQty *= seasonalMultiplier; // Apply seasonal adjustment
        recommendedQty = Math.max(0, recommendedQty - totalStock); // Subtract current stock

        // Generate reasoning
        const reasoning = this.generateReasoning({
            baseline,
            trendRate: trendCalc.growth_rate,
            seasonalMultiplier,
            currentStock: totalStock,
            seasonalPattern,
        });

        // Calculate confidence
        const confidence = this.calculateConfidenceScore(last6Months.length, trendCalc.confidence, seasonalPattern);

        return {
            baseline_quantity: Math.round(baseline),
            trend_adjustment: trendCalc.growth_rate,
            seasonal_multiplier: seasonalMultiplier,
            stock_adjustment: totalStock,
            final_recommendation: Math.round(recommendedQty),
            confidence_score: confidence,
            reasoning,
        };
    }

    /**
     * Detect seasonal patterns for all products
     */
    async detectSeasonalPatterns(yearsBack: number = 3): Promise<void> {
        const { data: products } = await supabase
            .from('products')
            .select('id, product_name, name');

        for (const product of products || []) {
            try {
                await this.detectSeasonalPatternsForProduct(product.id, yearsBack);
            } catch (err) {
                console.error(`Failed to detect patterns for product ${product.id}:`, err);
            }
        }
    }

    /**
     * Detect seasonal patterns for a specific product
     */
    private async detectSeasonalPatternsForProduct(productId: string, yearsBack: number): Promise<void> {
        // Get monthly sales data
        const monthlySales = await this.getMonthlySalesData(productId, yearsBack * 12);

        if (monthlySales.length < 12) {
            // Not enough data
            return;
        }

        // Calculate statistics
        const avgSales = monthlySales.reduce((sum, m) => sum + m.quantity, 0) / monthlySales.length;
        const stdDev = this.calculateStdDev(monthlySales.map(m => m.quantity));

        // Identify spikes (sales > avg + 1.5 * stdDev)
        const spikeThreshold = avgSales + 1.5 * stdDev;
        const spikes = monthlySales.filter(m => m.quantity > spikeThreshold);

        if (spikes.length === 0) {
            return;
        }

        // Group by month number to find recurring patterns
        const monthGroups = new Map<number, typeof spikes>();
        spikes.forEach(spike => {
            const monthNum = spike.month_number;
            if (!monthGroups.has(monthNum)) {
                monthGroups.set(monthNum, []);
            }
            monthGroups.get(monthNum)!.push(spike);
        });

        // Create patterns for months that spike multiple years
        for (const [monthNum, monthSpikes] of monthGroups.entries()) {
            if (monthSpikes.length >= 2) {
                // Recurring pattern detected
                const avgMultiplier = monthSpikes.reduce((sum, s) => sum + s.quantity, 0) / monthSpikes.length / avgSales;
                const yearsDetected = monthSpikes.map(s => s.year);
                const confidence = (monthSpikes.length / yearsBack) * 100;

                const monthName = new Date(2000, monthNum - 1).toLocaleString('default', { month: 'long' });

                await supabase.from('seasonal_patterns').upsert({
                    product_id: productId,
                    pattern_name: `${monthName} Spike`,
                    start_month: monthNum,
                    end_month: monthNum,
                    demand_multiplier: avgMultiplier,
                    confidence_score: confidence,
                    detection_method: 'auto',
                    years_detected: yearsDetected,
                    is_active: true,
                }, {
                    onConflict: 'product_id,start_month,end_month',
                });
            }
        }
    }

    // ============================================
    // HELPER METHODS
    // ============================================

    private calculateDateRange(filters: DemandTrendsFilters): { start_date: string; end_date: string } {
        const today = new Date();
        let start_date: string;
        let end_date: string = today.toISOString().split('T')[0];

        if (filters.period === 'custom' && filters.start_date && filters.end_date) {
            return { start_date: filters.start_date, end_date: filters.end_date };
        }

        switch (filters.period) {
            case '1m': {
                const date = new Date(today);
                date.setMonth(date.getMonth() - 1);
                start_date = date.toISOString().split('T')[0];
                break;
            }
            case '3m': {
                const date = new Date(today);
                date.setMonth(date.getMonth() - 3);
                start_date = date.toISOString().split('T')[0];
                break;
            }
            case '6m': {
                const date = new Date(today);
                date.setMonth(date.getMonth() - 6);
                start_date = date.toISOString().split('T')[0];
                break;
            }
            case '1y': {
                const date = new Date(today);
                date.setFullYear(date.getFullYear() - 1);
                start_date = date.toISOString().split('T')[0];
                break;
            }
            default: {
                const date = new Date(today);
                date.setMonth(date.getMonth() - 3);
                start_date = date.toISOString().split('T')[0];
            }
        }

        return { start_date, end_date };
    }

    private async getMonthlySalesData(productId: string, months: number): Promise<MonthlyAggregate[]> {
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - months);

        const { data, error } = await supabase
            .from('sales_order_items')
            .select(`
                quantity_bundles,
                sales_orders!inner (
                    order_date,
                    status
                )
            `)
            .eq('product_id', productId)
            .gte('sales_orders.order_date', startDate.toISOString().split('T')[0])
            .in('sales_orders.status', ['reserved', 'delivered']);

        if (error) throw new Error(error.message);

        // Group by month
        const monthMap = new Map<string, MonthlyAggregate>();

        data?.forEach((item: any) => {
            const orderDate = new Date(item.sales_orders.order_date);
            const month = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`;

            if (!monthMap.has(month)) {
                monthMap.set(month, {
                    month,
                    year: orderDate.getFullYear(),
                    month_number: orderDate.getMonth() + 1,
                    quantity: 0,
                    orders: 0,
                    average_order_size: 0,
                });
            }

            const aggregate = monthMap.get(month)!;
            aggregate.quantity += item.quantity_bundles;
            aggregate.orders += 1;
        });

        // Calculate averages
        for (const aggregate of monthMap.values()) {
            aggregate.average_order_size = aggregate.quantity / aggregate.orders;
        }

        return Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));
    }

    private calculateTrend(breakdown: MonthlyBreakdown[]): TrendCalculation {
        if (breakdown.length < 2) {
            return { growth_rate: 0, trend: 'stable', confidence: 0 };
        }

        // Simple linear regression
        const quantities = breakdown.map(m => m.quantity);
        const n = quantities.length;
        const xValues = Array.from({ length: n }, (_, i) => i);

        const sumX = xValues.reduce((a, b) => a + b, 0);
        const sumY = quantities.reduce((a, b) => a + b, 0);
        const sumXY = xValues.reduce((sum, x, i) => sum + x * quantities[i], 0);
        const sumXX = xValues.reduce((sum, x) => sum + x * x, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const avgQuantity = sumY / n;

        // Convert slope to percentage growth rate
        const growthRate = (slope / avgQuantity) * 100;

        let trend: 'growing' | 'stable' | 'declining';
        if (growthRate > 5) trend = 'growing';
        else if (growthRate < -5) trend = 'declining';
        else trend = 'stable';

        // Confidence based on data points
        const confidence = Math.min(100, (n / 12) * 100);

        return { growth_rate: growthRate, trend, confidence };
    }

    private calculateStdDev(values: number[]): number {
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const squareDiffs = values.map(value => Math.pow(value - avg, 2));
        const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
        return Math.sqrt(avgSquareDiff);
    }

    private async getCurrentStock(productId: string): Promise<StockLevel> {
        const { data, error } = await supabase
            .from('stock_balances')
            .select('state, quantity')
            .eq('product_id', productId);

        if (error) throw new Error(error.message);

        const stock: StockLevel = {
            product_id: productId,
            semi_finished: 0,
            packed: 0,
            finished: 0,
            total_available: 0,
        };

        data?.forEach((item: any) => {
            switch (item.state) {
                case 'semi_finished':
                    stock.semi_finished = item.quantity;
                    break;
                case 'packed':
                    stock.packed = item.quantity;
                    break;
                case 'finished':
                    stock.finished = item.quantity;
                    break;
            }
        });

        stock.total_available = stock.semi_finished + stock.packed + stock.finished;
        return stock;
    }

    private async getSeasonalPatternForMonth(productId: string, targetMonth: Date): Promise<any> {
        const monthNum = targetMonth.getMonth() + 1;

        const { data } = await supabase
            .from('seasonal_patterns')
            .select('*')
            .eq('product_id', productId)
            .eq('is_active', true)
            .lte('start_month', monthNum)
            .gte('end_month', monthNum)
            .order('confidence_score', { ascending: false })
            .limit(1)
            .single();

        return data;
    }

    private async getSeasonalPatternsForProduct(productId: string): Promise<any[]> {
        const { data } = await supabase
            .from('seasonal_patterns')
            .select('*')
            .eq('product_id', productId)
            .eq('is_active', true);

        return data || [];
    }

    private generateReasoning(params: {
        baseline: number;
        trendRate: number;
        seasonalMultiplier: number;
        currentStock: number;
        seasonalPattern: any;
    }): string {
        const parts: string[] = [];

        parts.push(`Based on 6-month average of ${Math.round(params.baseline)} units`);

        if (Math.abs(params.trendRate) > 5) {
            const direction = params.trendRate > 0 ? 'growing' : 'declining';
            parts.push(`${direction} trend (${params.trendRate > 0 ? '+' : ''}${params.trendRate.toFixed(1)}%)`);
        }

        if (params.seasonalPattern) {
            const increase = ((params.seasonalMultiplier - 1) * 100).toFixed(0);
            parts.push(`seasonal spike detected: ${params.seasonalPattern.pattern_name} (+${increase}%)`);
        }

        if (params.currentStock > 0) {
            parts.push(`current stock: ${Math.round(params.currentStock)} units`);
        }

        return parts.join(', ') + '.';
    }

    private calculateConfidenceScore(
        dataPoints: number,
        trendConfidence: number,
        seasonalPattern: any
    ): number {
        let confidence = 50; // Base confidence

        // More data points = higher confidence
        confidence += Math.min(30, (dataPoints / 12) * 30);

        // Trend confidence
        confidence += trendConfidence * 0.2;

        // Seasonal pattern adds confidence
        if (seasonalPattern) {
            confidence += seasonalPattern.confidence_score * 0.2;
        }

        return Math.min(100, Math.round(confidence));
    }

    private getNextMonth(): string {
        const date = new Date();
        date.setMonth(date.getMonth() + 1);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    /**
     * Accept a recommendation
     */
    async acceptRecommendation(id: string, userId: string, adjustedQuantity?: number): Promise<void> {
        const updateData: any = {
            status: 'accepted',
            accepted_by: userId,
            accepted_at: new Date().toISOString(),
        };

        if (adjustedQuantity !== undefined) {
            updateData.adjusted_quantity = adjustedQuantity;
        }

        const { error } = await supabase
            .from('production_recommendations')
            .update(updateData)
            .eq('id', id);

        if (error) throw new Error(error.message);
    }

    /**
     * Reject a recommendation
     */
    async rejectRecommendation(id: string, userId: string, reason?: string): Promise<void> {
        const { error } = await supabase
            .from('production_recommendations')
            .update({
                status: 'rejected',
                accepted_by: userId,
                accepted_at: new Date().toISOString(),
                rejection_reason: reason,
            })
            .eq('id', id);

        if (error) throw new Error(error.message);
    }
}

export const planningService = new PlanningService();
