import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../features/auth/providers/auth_provider.dart';
import '../data/production_repository.dart';

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
      _ref.read(lastEntryProvider.notifier).update(date, endTime);

      state = AsyncValue.data(saveAndAddAnother);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> submitCap({
    required String capId,
    required int shiftNumber,
    required String startTime,
    required String endTime,
    required double totalWeightKg,
    required double actualCycleTimeSeconds,
    required double actualWeightGrams,
    String? remarks,
    required DateTime date,
  }) async {
    state = const AsyncValue.loading();
    try {
      await _repository.submitCapProduction(
        capId: capId,
        shiftNumber: shiftNumber,
        startTime: startTime,
        endTime: endTime,
        totalWeightKg: totalWeightKg,
        actualCycleTimeSeconds: actualCycleTimeSeconds,
        actualWeightGrams: actualWeightGrams,
        remarks: remarks,
        date: date,
      );

      // Update sticky data
      _ref.read(lastEntryProvider.notifier).update(date, endTime);

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

  LastEntry({required this.date, required this.endTime});
}

class LastEntryNotifier extends StateNotifier<LastEntry?> {
  LastEntryNotifier() : super(null);

  void update(DateTime date, String endTime) {
    state = LastEntry(date: date, endTime: endTime);
  }
}

final lastEntryProvider =
    StateNotifierProvider<LastEntryNotifier, LastEntry?>((ref) {
  return LastEntryNotifier();
});
