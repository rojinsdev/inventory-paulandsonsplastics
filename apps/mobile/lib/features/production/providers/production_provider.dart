import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../features/auth/providers/auth_provider.dart';
import '../data/production_repository.dart';

final productionRepositoryProvider = Provider<ProductionRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return ProductionRepository(apiClient);
});

// State to handle form submission status
final productionSubmissionProvider =
    StateNotifierProvider<ProductionSubmissionNotifier, AsyncValue<void>>((
      ref,
    ) {
      final repository = ref.watch(productionRepositoryProvider);
      return ProductionSubmissionNotifier(repository);
    });

class ProductionSubmissionNotifier extends StateNotifier<AsyncValue<void>> {
  final ProductionRepository _repository;

  ProductionSubmissionNotifier(this._repository)
    : super(const AsyncValue.data(null));

  Future<void> submit({
    required String machineId,
    required String productId,
    required int quantity,
    required DateTime date,
    required String shift,
  }) async {
    state = const AsyncValue.loading();
    try {
      await _repository.submitProduction(
        machineId: machineId,
        productId: productId,
        quantity: quantity,
        date: date,
        shift: shift,
      );
      state = const AsyncValue.data(null);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }
}
