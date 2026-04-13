import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/data/user_model.dart';
import '../../auth/providers/auth_provider.dart';
import '../data/models/sales_order_item_model.dart';
import '../data/sales_order_repository.dart';

final salesOrderRepositoryProvider = Provider.autoDispose((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return SalesOrderRepository(apiClient);
});

final pendingOrdersProvider = StateNotifierProvider.autoDispose<
    PendingOrdersNotifier, AsyncValue<List<SalesOrderItem>>>((ref) {
  final notifier =
      PendingOrdersNotifier(ref.watch(salesOrderRepositoryProvider));

  void kick() {
    final factoryId = ref.read(authStateProvider).valueOrNull?.factoryId;
    Future.microtask(() => notifier.fetchPending(factoryId: factoryId));
  }

  kick();
  ref.listen<AsyncValue<User?>>(authStateProvider, (prev, next) {
    if (next.isLoading) return;
    notifier.fetchPending(factoryId: next.valueOrNull?.factoryId);
  });

  return notifier;
});

class PendingOrdersNotifier
    extends StateNotifier<AsyncValue<List<SalesOrderItem>>> {
  final SalesOrderRepository _repository;

  PendingOrdersNotifier(this._repository) : super(const AsyncValue.loading());

  Future<void> fetchPending({String? factoryId}) async {
    state = const AsyncValue.loading();
    try {
      final items =
          await _repository.getPendingPreparation(factoryId: factoryId);
      state = AsyncValue.data(items);
    } catch (e, stack) {
      state = AsyncValue.error(e, stack);
    }
  }

  Future<void> prepareOrderItems(
      String orderId, List<Map<String, dynamic>> items,
      {String? factoryId}) async {
    try {
      await _repository.prepareOrderItems(orderId, items);
      // Refresh the list after preparation
      await fetchPending(factoryId: factoryId);
    } catch (e) {
      rethrow;
    }
  }
}
