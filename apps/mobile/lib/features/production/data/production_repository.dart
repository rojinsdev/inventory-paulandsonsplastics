import 'package:dio/dio.dart';
import '../../../core/api/api_client.dart';
import '../../../core/constants/api_constants.dart';

class ProductionRepository {
  final ApiClient _apiClient;

  ProductionRepository(this._apiClient);

  Future<void> submitProduction({
    required String machineId,
    required String productId,
    required int shiftNumber,
    required String startTime,
    required String endTime,
    int? totalProduced,
    int? damagedCount,
    double? totalWeightKg,
    required double actualCycleTimeSeconds,
    required double actualWeightGrams,
    int? downtimeMinutes,
    String? downtimeReason,
    required DateTime date,
  }) async {
    try {
      final payload = {
        'machine_id': machineId,
        'product_id': productId,
        'shift_number': shiftNumber,
        'start_time': startTime,
        'end_time': endTime,
        'actual_cycle_time_seconds': actualCycleTimeSeconds,
        'actual_weight_grams': actualWeightGrams,
        'date': date.toIso8601String().split('T')[0], // YYYY-MM-DD
      };

      // Add optional fields
      if (totalProduced != null) payload['total_produced'] = totalProduced;
      if (damagedCount != null) payload['damaged_count'] = damagedCount;
      if (totalWeightKg != null) payload['total_weight_kg'] = totalWeightKg;
      if (downtimeMinutes != null)
        payload['downtime_minutes'] = downtimeMinutes;
      if (downtimeReason != null && downtimeReason.isNotEmpty) {
        payload['downtime_reason'] = downtimeReason;
      }

      await _apiClient.client.post(
        ApiConstants.productionSubmit,
        data: payload,
      );
    } catch (e) {
      if (e is DioException) {
        final errorMsg = e.response?.data['error'] ?? e.message;
        throw Exception(errorMsg);
      }
      rethrow;
    }
  }
}
