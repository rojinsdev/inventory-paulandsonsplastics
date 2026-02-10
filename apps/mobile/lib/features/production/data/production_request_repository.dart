import 'package:dio/dio.dart';
import '../../../core/api/api_client.dart';
import '../../../core/constants/api_constants.dart';
import 'models/production_request_model.dart';

class ProductionRequestRepository {
  final ApiClient _apiClient;

  ProductionRequestRepository(this._apiClient);

  Future<List<ProductionRequest>> getRequests({String? factoryId}) async {
    try {
      final response = await _apiClient.client.get(
        ApiConstants.productionRequests,
        queryParameters: factoryId != null ? {'factory_id': factoryId} : null,
      );

      final List<dynamic> data = response.data;
      return data.map((json) => ProductionRequest.fromJson(json)).toList();
    } catch (e) {
      if (e is DioException) {
        throw Exception(
            e.response?.data['error'] ?? 'Failed to fetch production requests');
      }
      rethrow;
    }
  }

  Future<ProductionRequest> updateStatus(
      String requestId, String status) async {
    try {
      final response = await _apiClient.client.patch(
        '${ApiConstants.productionRequests}/$requestId',
        data: {'status': status},
      );

      return ProductionRequest.fromJson(response.data);
    } catch (e) {
      if (e is DioException) {
        throw Exception(
            e.response?.data['error'] ?? 'Failed to update request status');
      }
      rethrow;
    }
  }
}
