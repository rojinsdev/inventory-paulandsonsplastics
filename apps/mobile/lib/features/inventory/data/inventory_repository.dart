import 'package:dio/dio.dart';
import '../../../core/api/api_client.dart';
import '../../../core/constants/api_constants.dart';
import '../providers/inventory_provider.dart';
import '../../inventory/providers/raw_material_model.dart';
import '../providers/cap_stock_model.dart';



class InventoryRepository {
  final ApiClient _apiClient;

  InventoryRepository(this._apiClient);

  /// Get all inventory stock (read-only)
  Future<List<InventoryStock>> getStock() async {
    try {
      final factoryId = await _apiClient.getFactoryId();
      final endpoint = factoryId != null
          ? '${ApiConstants.inventoryStock}?factory_id=$factoryId'
          : ApiConstants.inventoryStock;

      final response = await _apiClient.client.get(endpoint);
      final responseData = response.data;
      final List<dynamic> data;

      if (responseData is Map<String, dynamic> &&
          responseData.containsKey('stock')) {
        data = responseData['stock'] as List<dynamic>;
      } else if (responseData is List<dynamic>) {
        data = responseData;
      } else {
        data = [];
      }

      return data.map((item) => InventoryStock.fromJson(item)).toList();
    } catch (e) {
      if (e is DioException) {
        throw Exception(e.response?.data['error'] ?? 'Failed to fetch stock');
      }
      rethrow;
    }
  }

  /// Get aggregated stock overview (read-only)
  Future<List<InventoryStock>> getStockOverview() async {
    try {
      final factoryId = await _apiClient.getFactoryId();
      final endpoint = factoryId != null
          ? '${ApiConstants.inventoryStockOverview}?factory_id=$factoryId'
          : ApiConstants.inventoryStockOverview;

      final response = await _apiClient.client.get(endpoint);
      final data = response.data as List<dynamic>? ?? [];
      return data.map((item) => InventoryStock.fromJson(item)).toList();
    } catch (e) {
      if (e is DioException) {
        throw Exception(
            e.response?.data['error'] ?? 'Failed to fetch stock overview');
      }
      rethrow;
    }
  }

  /// Get raw materials (read-only)
  Future<List<RawMaterial>> getRawMaterials() async {
    try {
      final factoryId = await _apiClient.getFactoryId();
      final endpoint = factoryId != null
          ? '${ApiConstants.inventoryRawMaterials}?factory_id=$factoryId'
          : ApiConstants.inventoryRawMaterials;

      final response = await _apiClient.client.get(endpoint);
      final responseData = response.data;
      final List<dynamic> data;

      if (responseData is Map<String, dynamic> &&
          responseData.containsKey('rawMaterials')) {
        data = responseData['rawMaterials'] as List<dynamic>;
      } else if (responseData is List<dynamic>) {
        data = responseData;
      } else {
        data = [];
      }

      return data.map((item) => RawMaterial.fromJson(item)).toList();
    } catch (e) {
      if (e is DioException) {
        throw Exception(
            e.response?.data['error'] ?? 'Failed to fetch raw materials');
      }
      rethrow;
    }
  }

  /// Get cap stock balances (read-only)
  Future<List<CapStock>> getCapStockBalances() async {
    try {
      final factoryId = await _apiClient.getFactoryId();
      final endpoint = factoryId != null
          ? '${ApiConstants.inventoryCapBalances}?factory_id=$factoryId'
          : ApiConstants.inventoryCapBalances;

      final response = await _apiClient.client.get(endpoint);
      final responseData = response.data;
      final List<dynamic> data;

      if (responseData is Map<String, dynamic> &&
          responseData.containsKey('capBalances')) {
        data = responseData['capBalances'] as List<dynamic>;
      } else if (responseData is List<dynamic>) {
        data = responseData;
      } else {
        data = [];
      }

      return data.map((item) => CapStock.fromJson(item)).toList();
    } catch (e) {
      if (e is DioException) {
        throw Exception(
            e.response?.data['error'] ?? 'Failed to fetch cap stock balances');
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
    String? capId,
  }) async {
    try {
      await _apiClient.client.post(
        ApiConstants.inventoryPack,
        data: {
          'product_id': productId,
          'packets_created': packetsCreated,
          if (capId != null) 'cap_id': capId,
        },
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
    required int unitsCreated,
    String unitType = 'bundle',
    String source = 'packed',
    String? capId,
  }) async {
    try {
      await _apiClient.client.post(
        ApiConstants.inventoryBundle,
        data: {
          'product_id': productId,
          'units_created': unitsCreated,
          'unit_type': unitType,
          'source': source,
          if (capId != null) 'cap_id': capId,
        },
      );
    } catch (e) {
      if (e is DioException) {
        throw Exception(e.response?.data['error'] ?? 'Bundling failed');
      }
      rethrow;
    }
  }

  Future<void> unpack({
    required String productId,
    required int quantity,
    required String fromState,
    required String toState,
    String unitType = 'bundle',
    String? capId,
  }) async {
    try {
      await _apiClient.client.post(
        ApiConstants.inventoryUnpack,
        data: {
          'product_id': productId,
          'quantity': quantity,
          'from_state': fromState,
          'to_state': toState,
          'unit_type': unitType,
          if (capId != null) 'cap_id': capId,
        },
      );
    } catch (e) {
      if (e is DioException) {
        throw Exception(e.response?.data['error'] ?? 'Unpacking failed');
      }
      rethrow;
    }
  }


}
