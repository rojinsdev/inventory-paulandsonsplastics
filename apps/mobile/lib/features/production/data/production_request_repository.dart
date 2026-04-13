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
        throw Exception(e.response?.data['message'] ??
            e.response?.data['error'] ??
            'Failed to fetch production requests');
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

      final raw = response.data;
      if (raw is! Map) {
        throw Exception('Invalid production request update response');
      }
      var body = Map<String, dynamic>.from(raw);
      // Older API returned { success, request } for prepared/completed
      final nested = body['request'];
      if (nested is Map) {
        body = Map<String, dynamic>.from(nested);
      }
      return ProductionRequest.fromJson(body);
    } catch (e) {
      if (e is DioException) {
        throw Exception(e.response?.data['message'] ??
            e.response?.data['error'] ??
            'Failed to update request status');
      }
      rethrow;
    }
  }
}
