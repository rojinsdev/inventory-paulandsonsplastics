import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../features/auth/providers/auth_provider.dart';
import '../data/inventory_repository.dart';

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
  return repository.getStock();
});

class InventoryOperationNotifier extends StateNotifier<AsyncValue<void>> {
  final InventoryRepository _repository;

  InventoryOperationNotifier(this._repository)
      : super(const AsyncValue.data(null));

  Future<void> pack(String productId, int quantity) async {
    state = const AsyncValue.loading();
    try {
      await _repository.pack(productId: productId, packetsCreated: quantity);
      state = const AsyncValue.data(null);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> bundle(String productId, int quantity) async {
    state = const AsyncValue.loading();
    try {
      await _repository.bundle(productId: productId, bundlesCreated: quantity);
      state = const AsyncValue.data(null);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }
}

/// Model for inventory stock data
class InventoryStock {
  final String productId;
  final String productName;
  final int semiFinishedQty;
  final int packedQty;
  final int bundledQty;

  InventoryStock({
    required this.productId,
    required this.productName,
    required this.semiFinishedQty,
    required this.packedQty,
    required this.bundledQty,
  });

  factory InventoryStock.fromJson(Map<String, dynamic> json) {
    return InventoryStock(
      productId: json['product_id'] ?? json['id'] ?? '',
      productName: json['product_name'] ?? json['name'] ?? 'Unknown',
      semiFinishedQty:
          json['semi_finished_qty'] ?? json['semifinished_qty'] ?? 0,
      packedQty: json['packed_qty'] ?? 0,
      bundledQty: json['bundled_qty'] ?? 0,
    );
  }
}
