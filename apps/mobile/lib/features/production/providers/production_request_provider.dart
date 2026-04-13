import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/data/user_model.dart';
import '../../auth/providers/auth_provider.dart';
import '../data/models/production_request_model.dart';
import '../data/production_request_repository.dart';

final productionRequestRepositoryProvider =
    Provider<ProductionRequestRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return ProductionRequestRepository(apiClient);
});

final productionRequestsProvider = StateNotifierProvider<
    ProductionRequestNotifier, AsyncValue<List<ProductionRequest>>>((ref) {
  final repository = ref.watch(productionRequestRepositoryProvider);
  final notifier = ProductionRequestNotifier(repository);

  void kick() {
    final factoryId = ref.read(authStateProvider).valueOrNull?.factoryId;
    Future.microtask(() => notifier.fetchRequests(factoryId: factoryId));
  }

  kick();
  ref.listen<AsyncValue<User?>>(authStateProvider, (prev, next) {
    if (next.isLoading) return;
    notifier.fetchRequests(factoryId: next.valueOrNull?.factoryId);
  });

  return notifier;
});

class ProductionRequestNotifier
    extends StateNotifier<AsyncValue<List<ProductionRequest>>> {
  final ProductionRequestRepository _repository;

  ProductionRequestNotifier(this._repository)
      : super(const AsyncValue.loading());

  Future<void> fetchRequests({String? factoryId}) async {
    state = const AsyncValue.loading();
    try {
      final requests = await _repository.getRequests(factoryId: factoryId);
      state = AsyncValue.data(requests);
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
    }
  }

  Future<void> updateStatus(String requestId, String status) async {
    try {
      final updated = await _repository.updateStatus(requestId, status);

      state.whenData((requests) {
        state = AsyncValue.data(
          requests.map((r) => r.id == requestId ? updated : r).toList(),
        );
      });
    } catch (e) {
      rethrow;
    }
  }
}
