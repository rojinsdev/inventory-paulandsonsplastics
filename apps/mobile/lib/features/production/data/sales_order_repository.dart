import 'package:dio/dio.dart';
import '../../../core/api/api_client.dart';
import '../../../core/constants/api_constants.dart';
import 'models/sales_order_item_model.dart';

class SalesOrderRepository {
  final ApiClient _apiClient;

  SalesOrderRepository(this._apiClient);

  Future<List<SalesOrderItem>> getPendingPreparation(
      {String? factoryId}) async {
    try {
      final response = await _apiClient.client.get(
        ApiConstants.salesOrders,
        queryParameters: {
          if (factoryId != null) 'factory_id': factoryId,
          'status':
              'pending', // We only care about pending orders that need preparation
        },
      );

      final dynamic data = response.data;
      List<dynamic> orders = [];

      if (data is List) {
        orders = data;
      } else if (data is Map &&
          data.containsKey('orders') &&
          data['orders'] is List) {
        orders = data['orders'];
      } else if (data is Map &&
          data.containsKey('data') &&
          data['data'] is List) {
        orders = data['data'];
      } else {
        // If it's a String (like an HTML error page) or unexpected Map, throw a clear error
        throw Exception(
            'Received unexpected data format from server. Please check your connection or contact support.');
      }

      final List<SalesOrderItem> allItems = [];

      for (var order in orders) {
        final items = order['sales_order_items'] as List<dynamic>?;
        if (items != null) {
          for (var item in items) {
            // If filtering by factory on backend is working, it should already be filtered.
            // But flattening it here is necessary because the backend returns nested orders.
            allItems.add(SalesOrderItem.fromOrderJson(order, item));
          }
        }
      }

      // Sort by delivery date (closest first)
      allItems.sort((a, b) {
        if (a.deliveryDate == null && b.deliveryDate == null) return 0;
        if (a.deliveryDate == null) return 1;
        if (b.deliveryDate == null) return -1;
        return a.deliveryDate!.compareTo(b.deliveryDate!);
      });

      return allItems;
    } catch (e) {
      if (e is DioException) {
        throw Exception(
            e.response?.data['message'] ?? 'Failed to fetch orders');
      }
      rethrow;
    }
  }

  Future<void> prepareOrderItems(
      String orderId, List<Map<String, dynamic>> items) async {
    try {
      await _apiClient.client.put(
        '${ApiConstants.salesOrders}/$orderId/prepare-items',
        data: {'items': items},
      );
    } catch (e) {
      if (e is DioException) {
        throw Exception(
            e.response?.data['message'] ?? 'Failed to prepare items');
      }
      rethrow;
    }
  }
}
