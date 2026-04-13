import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../features/auth/providers/auth_provider.dart';
import '../data/production_repository.dart';
import '../data/models/production_history_model.dart';
import '../../inventory/providers/inventory_provider.dart';

final productionRepositoryProvider = Provider<ProductionRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return ProductionRepository(apiClient);
});

// State to handle form submission status
final productionSubmissionProvider =
    StateNotifierProvider<ProductionSubmissionNotifier, AsyncValue<bool>>((
  ref,
) {
  final repository = ref.watch(productionRepositoryProvider);
  return ProductionSubmissionNotifier(repository, ref);
});

class ProductionSubmissionNotifier extends StateNotifier<AsyncValue<bool>> {
  final ProductionRepository _repository;
  final Ref _ref;

  ProductionSubmissionNotifier(this._repository, this._ref)
      : super(const AsyncValue.data(false));

  Future<void> submit({
    required String machineId,
    required String productId,
    required int shiftNumber,
    required String startTime,
    required String endTime,
    int? totalProduced,
    int? damagedCount,
    double? totalWeightKg,
    required double actualCycleTimeSeconds,
    required double actualWeightGrams,
    int? downtimeMinutes,
    String? downtimeReason,
    required DateTime date,
    bool saveAndAddAnother = false,
  }) async {
    state = const AsyncValue.loading();
    try {
      await _repository.submitProduction(
        machineId: machineId,
        productId: productId,
        shiftNumber: shiftNumber,
        startTime: startTime,
        endTime: endTime,
        totalProduced: totalProduced,
        damagedCount: damagedCount,
        totalWeightKg: totalWeightKg,
        actualCycleTimeSeconds: actualCycleTimeSeconds,
        actualWeightGrams: actualWeightGrams,
        downtimeMinutes: downtimeMinutes,
        downtimeReason: downtimeReason,
        date: date,
      );

      // Update sticky data
      _ref.read(lastEntryProvider.notifier).update(date, endTime, shiftNumber);

      // AUTO-REFRESH: Invalidate relevant data providers
      _ref.invalidate(productionHistoryListProvider);
      _ref.invalidate(inventoryStockProvider);

      state = AsyncValue.data(saveAndAddAnother);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> submitCap({
    required String capId,
    required String machineId,
    required int shiftNumber,
    required String startTime,
    required String endTime,
    double? totalWeightKg,
    int? totalProduced,
    required double actualCycleTimeSeconds,
    required double actualWeightGrams,
    String? remarks,
    int? downtimeMinutes,
    String? downtimeReason,
    required DateTime date,
  }) async {
    state = const AsyncValue.loading();
    try {
      await _repository.submitCapProduction(
        capId: capId,
        machineId: machineId,
        shiftNumber: shiftNumber,
        startTime: startTime,
        endTime: endTime,
        totalWeightKg: totalWeightKg,
        totalProduced: totalProduced,
        actualCycleTimeSeconds: actualCycleTimeSeconds,
        actualWeightGrams: actualWeightGrams,
        remarks: remarks,
        downtimeMinutes: downtimeMinutes,
        downtimeReason: downtimeReason,
        date: date,
      );

      // Update sticky data
      _ref.read(lastEntryProvider.notifier).update(date, endTime, shiftNumber);

      // AUTO-REFRESH: Invalidate relevant data providers
      _ref.invalidate(productionHistoryListProvider);
      _ref.invalidate(inventoryStockProvider);
      _ref.invalidate(capStockProvider);

      state = const AsyncValue.data(false);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> submitInner({
    required String innerId,
    required String machineId,
    required int shiftNumber,
    required String startTime,
    required String endTime,
    double? totalWeightKg,
    int? totalProduced,
    required double actualCycleTimeSeconds,
    required double actualWeightGrams,
    String? remarks,
    int? downtimeMinutes,
    String? downtimeReason,
    required DateTime date,
  }) async {
    state = const AsyncValue.loading();
    try {
      await _repository.submitInnerProduction(
        innerId: innerId,
        machineId: machineId,
        shiftNumber: shiftNumber,
        startTime: startTime,
        endTime: endTime,
        totalWeightKg: totalWeightKg,
        totalProduced: totalProduced,
        actualCycleTimeSeconds: actualCycleTimeSeconds,
        actualWeightGrams: actualWeightGrams,
        remarks: remarks,
        downtimeMinutes: downtimeMinutes,
        downtimeReason: downtimeReason,
        date: date,
      );

      // Update sticky data
      _ref.read(lastEntryProvider.notifier).update(date, endTime, shiftNumber);

      // AUTO-REFRESH: Invalidate relevant data providers
      _ref.invalidate(productionHistoryListProvider);
      _ref.invalidate(inventoryStockProvider);
      _ref.invalidate(innerStockProvider);

      state = const AsyncValue.data(false);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }
}

// Sticky Start Time Logic
class LastEntry {
  final DateTime date;
  final String endTime;
  final int shiftNumber;

  LastEntry({
    required this.date,
    required this.endTime,
    required this.shiftNumber,
  });
}

class LastEntryNotifier extends StateNotifier<LastEntry?> {
  LastEntryNotifier() : super(null);

  void update(DateTime date, String endTime, int shiftNumber) {
    state = LastEntry(date: date, endTime: endTime, shiftNumber: shiftNumber);
  }
}

final lastEntryProvider =
    StateNotifierProvider<LastEntryNotifier, LastEntry?>((ref) {
  return LastEntryNotifier();
});

// History Provider Params Class
class ProductionHistoryParams {
  final String? userId;
  final String? itemType;
  final String? factoryId;
  final String? startDate;
  final String? endDate;

  ProductionHistoryParams({
    this.userId,
    this.itemType,
    this.factoryId,
    this.startDate,
    this.endDate,
  });

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ProductionHistoryParams &&
          runtimeType == other.runtimeType &&
          userId == other.userId &&
          itemType == other.itemType &&
          factoryId == other.factoryId &&
          startDate == other.startDate &&
          endDate == other.endDate;

  @override
  int get hashCode =>
      userId.hashCode ^
      itemType.hashCode ^
      factoryId.hashCode ^
      startDate.hashCode ^
      endDate.hashCode;
}

// History Provider
final productionHistoryListProvider = StateNotifierProvider.family<
    ProductionHistoryNotifier,
    AsyncValue<ProductionHistoryResponse>,
    ProductionHistoryParams>((ref, params) {
  final repository = ref.watch(productionRepositoryProvider);
  return ProductionHistoryNotifier(repository, params);
});

class ProductionHistoryNotifier
    extends StateNotifier<AsyncValue<ProductionHistoryResponse>> {
  final ProductionRepository _repository;
  final ProductionHistoryParams _params;

  ProductionHistoryNotifier(this._repository, this._params)
      : super(const AsyncValue.loading()) {
    fetch();
  }

  Future<void> fetch({int page = 1}) async {
    if (page == 1) state = const AsyncValue.loading();
    try {
      final response = await _repository.getProductionHistory(
        factoryId: _params.factoryId,
        userId: _params.userId,
        itemType: _params.itemType,
        startDate: _params.startDate,
        endDate: _params.endDate,
        page: page,
      );

      if (page == 1) {
        state = AsyncValue.data(response);
      } else {
        final previousResponse = state.value;
        if (previousResponse != null) {
          state = AsyncValue.data(ProductionHistoryResponse(
            logs: [...previousResponse.logs, ...response.logs],
            total: response.total,
            page: response.page,
            totalPages: response.totalPages,
          ));
        } else {
          state = AsyncValue.data(response);
        }
      }
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }
}
