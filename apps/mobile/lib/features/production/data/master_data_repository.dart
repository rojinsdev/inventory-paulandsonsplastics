import '../../../core/api/api_client.dart';
import '../../../core/constants/api_constants.dart';
import 'models/machine_model.dart';
import 'models/product_model.dart';
import 'models/product_template_model.dart';
import 'models/cap_model.dart';
import 'models/cap_template_model.dart';

class MasterDataRepository {
  final ApiClient _apiClient;

  MasterDataRepository(this._apiClient);

  Future<List<Machine>> getMachines() async {
    final factoryId = await _apiClient.getFactoryId();
    final endpoint = factoryId != null
        ? '${ApiConstants.machines}?factory_id=$factoryId'
        : ApiConstants.machines;

    final response = await _apiClient.client.get(endpoint);
    // Server returns array directly, not wrapped in {data: [...]}
    final dynamic rawData = response.data;
    List<dynamic> items = [];

    if (rawData is List) {
      items = rawData;
    } else if (rawData is Map &&
        rawData.containsKey('data') &&
        rawData['data'] is List) {
      items = rawData['data'];
    } else {
      throw Exception(
          'Failed to load machines: Unexpected data format from server.');
    }

    return items.map((e) => Machine.fromJson(e)).toList();
  }

  Future<List<Product>> getProducts() async {
    final factoryId = await _apiClient.getFactoryId();
    final endpoint = factoryId != null
        ? '${ApiConstants.products}?factory_id=$factoryId'
        : ApiConstants.products;

    final response = await _apiClient.client.get(endpoint);
    // Server returns array directly, not wrapped in {data: [...]}
    final dynamic rawData = response.data;
    List<dynamic> items = [];

    if (rawData is List) {
      items = rawData;
    } else if (rawData is Map &&
        rawData.containsKey('data') &&
        rawData['data'] is List) {
      items = rawData['data'];
    } else {
      throw Exception(
          'Failed to load products: Unexpected data format from server.');
    }

    return items.map((e) => Product.fromJson(e)).toList();
  }

  Future<List<ProductTemplate>> getProductTemplates() async {
    final factoryId = await _apiClient.getFactoryId();
    final endpoint = factoryId != null
        ? '${ApiConstants.productTemplates}?factory_id=$factoryId'
        : ApiConstants.productTemplates;

    final response = await _apiClient.client.get(endpoint);
    final dynamic rawData = response.data;
    List<dynamic> items = [];

    if (rawData is List) {
      items = rawData;
    } else if (rawData is Map &&
        rawData.containsKey('data') &&
        rawData['data'] is List) {
      items = rawData['data'];
    } else {
      throw Exception(
          'Failed to load product templates: Unexpected data format from server.');
    }

    return items.map((e) => ProductTemplate.fromJson(e)).toList();
  }

  Future<List<Cap>> getCaps() async {
    final factoryId = await _apiClient.getFactoryId();
    final endpoint = factoryId != null
        ? '${ApiConstants.caps}?factory_id=$factoryId'
        : ApiConstants.caps;

    final response = await _apiClient.client.get(endpoint);
    final dynamic rawData = response.data;
    List<dynamic> items = [];

    if (rawData is List) {
      items = rawData;
    } else if (rawData is Map &&
        rawData.containsKey('data') &&
        rawData['data'] is List) {
      items = rawData['data'];
    } else {
      throw Exception(
          'Failed to load caps: Unexpected data format from server.');
    }

    return items.map((e) => Cap.fromJson(e)).toList();
  }

  Future<List<CapTemplate>> getCapTemplates() async {
    final factoryId = await _apiClient.getFactoryId();
    final endpoint = factoryId != null
        ? '${ApiConstants.capTemplates}?factory_id=$factoryId'
        : ApiConstants.capTemplates;

    final response = await _apiClient.client.get(endpoint);
    final dynamic rawData = response.data;
    List<dynamic> items = [];

    if (rawData is List) {
      items = rawData;
    } else if (rawData is Map &&
        rawData.containsKey('data') &&
        rawData['data'] is List) {
      items = rawData['data'];
    } else {
      throw Exception(
          'Failed to load cap templates: Unexpected data format from server.');
    }

    return items.map((e) => CapTemplate.fromJson(e)).toList();
  }
}
