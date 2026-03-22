import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../auth/providers/auth_provider.dart';
import '../data/models/sales_order_item_model.dart';
import '../data/sales_order_repository.dart';

final salesOrderRepositoryProvider = Provider.autoDispose((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return SalesOrderRepository(apiClient);
});

final pendingOrdersProvider = StateNotifierProvider.autoDispose<
    PendingOrdersNotifier, AsyncValue<List<SalesOrderItem>>>((ref) {
  return PendingOrdersNotifier(ref.watch(salesOrderRepositoryProvider));
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
