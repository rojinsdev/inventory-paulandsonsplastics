import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../features/auth/providers/auth_provider.dart';
import '../data/inventory_repository.dart';
import 'raw_material_model.dart';
import 'cap_stock_model.dart';

final inventoryRepositoryProvider = Provider<InventoryRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return InventoryRepository(apiClient);
});

final inventoryOperationProvider =
    StateNotifierProvider<InventoryOperationNotifier, AsyncValue<void>>((ref) {
  final repository = ref.watch(inventoryRepositoryProvider);
  return InventoryOperationNotifier(repository);
});

/// Provider for fetching inventory stock summary
final inventoryStockProvider =
    FutureProvider<List<InventoryStock>>((ref) async {
  final repository = ref.watch(inventoryRepositoryProvider);
  return repository.getStockOverview();
});

final rawMaterialsProvider =
    FutureProvider.autoDispose<List<RawMaterial>>((ref) async {
  final repository = ref.watch(inventoryRepositoryProvider);
  return repository.getRawMaterials();
});

final capStockProvider =
    FutureProvider.autoDispose<List<CapStock>>((ref) async {
  final repository = ref.watch(inventoryRepositoryProvider);
  return repository.getCapStockBalances();
});



class InventoryOperationNotifier extends StateNotifier<AsyncValue<void>> {
  final InventoryRepository _repository;

  InventoryOperationNotifier(this._repository)
      : super(const AsyncValue.data(null));

  Future<void> pack(String productId, int quantity,
      {String? capId}) async {
    state = const AsyncValue.loading();
    try {
      await _repository.pack(
        productId: productId,
        packetsCreated: quantity,
        capId: capId,
      );
      state = const AsyncValue.data(null);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> bundle(String productId, int quantity,
      {String source = 'packed', String? capId}) async {
    state = const AsyncValue.loading();
    try {
      await _repository.bundle(
        productId: productId,
        bundlesCreated: quantity,
        source: source,
        capId: capId,
      );
      state = const AsyncValue.data(null);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> unpack(
    String productId,
    int quantity,
    String fromState,
    String toState, {
    String? capId,
  }) async {
    state = const AsyncValue.loading();
    try {
      await _repository.unpack(
        productId: productId,
        quantity: quantity,
        fromState: fromState,
        toState: toState,
        capId: capId,
      );
      state = const AsyncValue.data(null);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> adjustRawMaterial(
      String id, double quantity, String reason) async {
    state = const AsyncValue.loading();
    try {
      await _repository.adjustRawMaterial(
          id: id, quantityKg: quantity, reason: reason);
      state = const AsyncValue.data(null);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }
}

/// Model for inventory stock data
class InventoryStock {
  final String? productId; // variant_id
  final String productName; // template name
  final String? color;
  final String? size;
  final String? capId;
  final String? capName;
  final String? capColor;
  final int semiFinishedQty;
  final int packedQty;
  final int bundledQty;
  final int? itemsPerPacket;
  final int? packetsPerBundle;
  final int? itemsPerBundle;

  InventoryStock({
    this.productId,
    required this.productName,
    this.color,
    this.size,
    this.capId,
    this.capName,
    this.capColor,
    required this.semiFinishedQty,
    required this.packedQty,
    required this.bundledQty,
    this.itemsPerPacket,
    this.packetsPerBundle,
    this.itemsPerBundle,
  });

  factory InventoryStock.fromJson(Map<String, dynamic> json) {
    return InventoryStock(
      productId: (json['variant_id'] ?? json['product_id'] ?? json['id'] ?? '')
          as String?,
      productName:
          (json['product_name'] ?? json['name'] ?? 'Unknown') as String,
      color: json['color'] as String?,
      size: json['size'] as String?,
      capId: json['cap_id'] as String?,
      capName: json['cap_name'] as String?,
      capColor: json['cap_color'] as String?,
      semiFinishedQty:
          ((json['semi_finished_qty'] ?? json['semifinished_qty'] ?? 0) as num)
              .toInt(),
      packedQty: ((json['packed_qty'] ?? 0) as num).toInt(),
      bundledQty: ((json['bundled_qty'] ?? 0) as num).toInt(),
      itemsPerPacket: json['items_per_packet'] as int?,
      packetsPerBundle: json['packets_per_bundle'] as int?,
      itemsPerBundle: json['items_per_bundle'] as int?,
    );
  }

  String get displayName {
    String name = productName;
    if (size != null) name += ' ($size)';
    if (color != null) name += ' - $color';
    if (capName != null) {
      name += ' + $capName';
      if (capColor != null) name += ' ($capColor)';
    }
    return name;
  }
}
