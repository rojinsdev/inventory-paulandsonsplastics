import '../../../core/api/api_client.dart';
import '../../../core/constants/api_constants.dart';
import 'models/machine_model.dart';
import 'models/product_model.dart';

class MasterDataRepository {
  final ApiClient _apiClient;

  MasterDataRepository(this._apiClient);

  Future<List<Machine>> getMachines() async {
    final response = await _apiClient.client.get(ApiConstants.machines);
    // Server returns array directly, not wrapped in {data: [...]}
    final data = response.data;
    if (data is List) {
      return data.map((e) => Machine.fromJson(e)).toList();
    }
    // Fallback if wrapped in {data: [...]}
    final List items = data['data'] ?? [];
    return items.map((e) => Machine.fromJson(e)).toList();
  }

  Future<List<Product>> getProducts() async {
    final response = await _apiClient.client.get(ApiConstants.products);
    // Server returns array directly, not wrapped in {data: [...]}
    final data = response.data;
    if (data is List) {
      return data.map((e) => Product.fromJson(e)).toList();
    }
    // Fallback if wrapped in {data: [...]}
    final List items = data['data'] ?? [];
    return items.map((e) => Product.fromJson(e)).toList();
  }
}
