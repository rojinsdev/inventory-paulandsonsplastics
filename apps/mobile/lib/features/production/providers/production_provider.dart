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
  return ProductionSubmissionNotifier(repository);
});

class ProductionSubmissionNotifier extends StateNotifier<AsyncValue<bool>> {
  final ProductionRepository _repository;

  ProductionSubmissionNotifier(this._repository)
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
      state = AsyncValue.data(saveAndAddAnother);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }
}
