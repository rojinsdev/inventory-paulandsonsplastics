import 'package:dio/dio.dart';
import '../../../core/api/api_client.dart';
import '../../../core/constants/api_constants.dart';

class ProductionRepository {
  final ApiClient _apiClient;

  ProductionRepository(this._apiClient);

  Future<void> submitProduction({
    required String machineId,
    required String productId,
    required int quantity,
    required DateTime date,
    required String shift,
  }) async {
    try {
      await _apiClient.client.post(
        ApiConstants.productionSubmit,
        data: {
          'machine_id': machineId,
          'product_id': productId,
          'actual_quantity': quantity,
          'date': date.toIso8601String().split('T')[0], // YYYY-MM-DD
          'shift': shift,
        },
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
