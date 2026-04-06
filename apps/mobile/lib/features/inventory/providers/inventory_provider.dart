import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../features/auth/providers/auth_provider.dart';
import '../data/inventory_repository.dart';
import 'raw_material_model.dart';
import 'cap_stock_model.dart';
import 'inner_stock_model.dart';

final inventoryRepositoryProvider = Provider<InventoryRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return InventoryRepository(apiClient);
});

final inventoryOperationProvider =
    StateNotifierProvider<InventoryOperationNotifier, AsyncValue<void>>((ref) {
  final repository = ref.watch(inventoryRepositoryProvider);
  return InventoryOperationNotifier(repository, ref);
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

final innerStockProvider =
    FutureProvider.autoDispose<List<InnerStock>>((ref) async {
  final repository = ref.watch(inventoryRepositoryProvider);
  return repository.getInnerStockBalances();
});

final inventoryTransactionsProvider = 
    FutureProvider.autoDispose.family<List<InventoryTransaction>, String?>((ref, productId) async {
  final repository = ref.watch(inventoryRepositoryProvider);
  return repository.getTransactions(productId: productId);
});



class InventoryOperationNotifier extends StateNotifier<AsyncValue<void>> {
  final InventoryRepository _repository;
  final Ref _ref;

  InventoryOperationNotifier(this._repository, this._ref)
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

      // AUTO-REFRESH: Invalidate relevant data providers
      _ref.invalidate(inventoryStockProvider);
      _ref.invalidate(capStockProvider);

      state = const AsyncValue.data(null);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> bundle(String productId, int quantity,
      {String unitType = 'bundle', String source = 'packed', String? capId}) async {
    state = const AsyncValue.loading();
    try {
      await _repository.bundle(
        productId: productId,
        unitsCreated: quantity,
        unitType: unitType,
        source: source,
        capId: capId,
      );

      // AUTO-REFRESH: Invalidate relevant data providers
      _ref.invalidate(inventoryStockProvider);
      _ref.invalidate(capStockProvider);

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
    String unitType = 'bundle',
    String? capId,
  }) async {
    state = const AsyncValue.loading();
    try {
      await _repository.unpack(
        productId: productId,
        quantity: quantity,
        fromState: fromState,
        toState: toState,
        unitType: unitType,
        capId: capId,
      );

      // AUTO-REFRESH: Invalidate relevant data providers
      _ref.invalidate(inventoryStockProvider);
      _ref.invalidate(capStockProvider);

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

      // AUTO-REFRESH: Invalidate relevant data providers
      _ref.invalidate(rawMaterialsProvider);

      state = const AsyncValue.data(null);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }
}

/// Model for stock combination (Cap + Inner)
class StockCombination {
  final String? capId;
  final String? capColor;
  final String? capName;
  final String? unitType;
  final int packedQty;
  final int bundledQty;

  StockCombination({
    this.capId,
    this.capColor,
    this.capName,
    this.unitType,
    required this.packedQty,
    required this.bundledQty,
  });

  factory StockCombination.fromJson(Map<String, dynamic> json) {
    return StockCombination(
      capId: json['cap_id'] as String?,
      capColor: json['cap_color'] as String?,
      capName: json['cap_name'] as String?,
      unitType: json['unit_type'] as String?,
      packedQty: ((json['packed_qty'] ?? 0) as num).toInt(),
      bundledQty: ((json['bundled_qty'] ?? 0) as num).toInt(),
    );
  }
}

/// Model for inventory stock data
class InventoryStock {
  final String? productId; // variant_id
  final String productName; // template name
  final String? color;
  final String? size;
  final List<StockCombination>? _combinations; // Nullable backing field for hot-reload safety
  final int semiFinishedQty;
  final int packedQty;
  final int bundledQty;
  final int? itemsPerPacket;
  final int? packetsPerBundle;
  final int? itemsPerBundle;
  final int? packetsPerBag;
  final int? itemsPerBag;
  final int? packetsPerBox;
  final int? itemsPerBox;

  List<StockCombination> get combinations => _combinations ?? const [];

  InventoryStock({
    this.productId,
    required this.productName,
    this.color,
    this.size,
    List<StockCombination>? combinations,
    required this.semiFinishedQty,
    required this.packedQty,
    required this.bundledQty,
    this.itemsPerPacket,
    this.packetsPerBundle,
    this.itemsPerBundle,
    this.packetsPerBag,
    this.itemsPerBag,
    this.packetsPerBox,
    this.itemsPerBox,
  }) : _combinations = combinations;

  /// Convenience getters for backward compatibility
  String? get unitType => combinations.isNotEmpty ? combinations.first.unitType : null;
  String? get capId => combinations.isNotEmpty ? combinations.first.capId : null;
  String? get capName => combinations.isNotEmpty ? combinations.first.capName : null;
  String? get capColor => combinations.isNotEmpty ? combinations.first.capColor : null;

  factory InventoryStock.fromJson(Map<String, dynamic> json) {
    final List<StockCombination> combos = [];
    int totalPacked = 0;
    int totalBundled = 0;
    
    final rawCombinations = json['combinations'];
    if (rawCombinations is List && rawCombinations.isNotEmpty) {
      for (var combo in rawCombinations) {
        if (combo is Map<String, dynamic>) {
          final c = StockCombination.fromJson(combo);
          combos.add(c);
          totalPacked += c.packedQty;
          totalBundled += c.bundledQty;
        }
      }
    } else {
      totalPacked = ((json['packed_qty'] ?? 0) as num).toInt();
      totalBundled = ((json['bundled_qty'] ?? 0) as num).toInt();
      // Add a default combination representing the base stock
      combos.add(StockCombination(
        packedQty: totalPacked,
        bundledQty: totalBundled,
        unitType: json['unit_type'] as String?,
      ));
    }

    return InventoryStock(
      productId: (json['variant_id'] ?? json['product_id'] ?? json['id'] ?? '')
          ?.toString(),
      productName:
          (json['product_name'] ?? json['name'] ?? 'Unknown').toString(),
      color: json['color'] as String?,
      size: json['size'] as String?,
      combinations: combos,
      semiFinishedQty:
          ((json['semi_finished_qty'] ?? json['semifinished_qty'] ?? 0) as num)
              .toInt(),
      packedQty: totalPacked,
      bundledQty: totalBundled,
      itemsPerPacket: json['items_per_packet'] as int?,
      packetsPerBundle: json['packets_per_bundle'] as int?,
      itemsPerBundle: json['items_per_bundle'] as int?,
      packetsPerBag: json['packets_per_bag'] as int?,
      itemsPerBag: json['items_per_bag'] as int?,
      packetsPerBox: json['packets_per_box'] as int?,
      itemsPerBox: json['items_per_box'] as int?,
    );
  }

  String get displayName {
    String name = productName;
    if (size != null) name += ' ($size)';
    if (color != null) name += ' - $color';
    return name;
  }
}
