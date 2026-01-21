import 'package:dio/dio.dart';
import '../../../core/api/api_client.dart';
import '../../../core/constants/api_constants.dart';
import '../providers/inventory_provider.dart';
import '../../inventory/providers/raw_material_model.dart';

class InventoryRepository {
  final ApiClient _apiClient;

  InventoryRepository(this._apiClient);

  /// Get all inventory stock (read-only)
  Future<List<InventoryStock>> getStock() async {
    try {
      final response = await _apiClient.client.get(ApiConstants.inventoryStock);
      final data = response.data as List<dynamic>? ?? [];
      return data.map((item) => InventoryStock.fromJson(item)).toList();
    } catch (e) {
      if (e is DioException) {
        throw Exception(e.response?.data['error'] ?? 'Failed to fetch stock');
      }
      rethrow;
    }
  }

  /// Get raw materials (read-only)
  Future<List<RawMaterial>> getRawMaterials() async {
    try {
      final response =
          await _apiClient.client.get(ApiConstants.inventoryRawMaterials);
      final data = response.data as List<dynamic>? ?? [];
      return data.map((item) => RawMaterial.fromJson(item)).toList();
    } catch (e) {
      if (e is DioException) {
        throw Exception(
            e.response?.data['error'] ?? 'Failed to fetch raw materials');
      }
      rethrow;
    }
  }

  Future<void> adjustRawMaterial({
    required String id,
    required double quantityKg,
    required String reason,
  }) async {
    try {
      await _apiClient.client.post(
        '${ApiConstants.inventoryRawMaterials}/$id/adjust',
        data: {
          'quantity_kg': quantityKg,
          'reason': reason,
        },
      );
    } catch (e) {
      if (e is DioException) {
        throw Exception(
            e.response?.data['error'] ?? 'Failed to adjust raw material');
      }
      rethrow;
    }
  }

  Future<void> pack({
    required String productId,
    required int packetsCreated,
  }) async {
    try {
      await _apiClient.client.post(
        ApiConstants.inventoryPack,
        data: {'product_id': productId, 'packets_created': packetsCreated},
      );
    } catch (e) {
      if (e is DioException) {
        throw Exception(e.response?.data['error'] ?? 'Packing failed');
      }
      rethrow;
    }
  }

  Future<void> bundle({
    required String productId,
    required int bundlesCreated,
  }) async {
    try {
      await _apiClient.client.post(
        ApiConstants.inventoryBundle,
        data: {'product_id': productId, 'bundles_created': bundlesCreated},
      );
    } catch (e) {
      if (e is DioException) {
        throw Exception(e.response?.data['error'] ?? 'Bundling failed');
      }
      rethrow;
    }
  }
}
