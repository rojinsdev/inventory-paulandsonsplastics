import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../providers/sales_order_provider.dart';
import '../../auth/providers/auth_provider.dart';
import '../data/models/sales_order_item_model.dart';

class OrderPreparationScreen extends ConsumerStatefulWidget {
  const OrderPreparationScreen({super.key});

  @override
  ConsumerState<OrderPreparationScreen> createState() =>
      _OrderPreparationScreenState();
}

class _OrderPreparationScreenState
    extends ConsumerState<OrderPreparationScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final user = ref.read(authStateProvider).value;
      ref
          .read(pendingOrdersProvider.notifier)
          .fetchPending(factoryId: user?.factoryId);
    });
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);
    final user = authState.value;
    final itemsAsync = ref.watch(pendingOrdersProvider);
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Order Preparation'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () =>
                ref.read(pendingOrdersProvider.notifier).fetchPending(
                      factoryId: user?.factoryId,
                    ),
          ),
        ],
      ),
      body: itemsAsync.when(
        data: (items) {
          final groupedItems = <String, List<SalesOrderItem>>{};
          for (final item in items) {
            if (!item.isPrepared) {
              groupedItems.putIfAbsent(item.orderId, () => []).add(item);
            }
          }

          if (groupedItems.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.check_circle_outline,
                      size: 64, color: colorScheme.outline),
                  const SizedBox(height: 16),
                  Text('All orders prepared!',
                      style: theme.textTheme.titleMedium),
                  const SizedBox(height: 8),
                  Text('Great job keeping up!',
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: colorScheme.outline)),
                ],
              ),
            );
          }

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              for (final entry in groupedItems.entries)
                _OrderPreparedCard(
                  orderId: entry.key,
                  orderNumber: entry.value.first.orderNumber,
                  customerName: entry.value.first.customerName,
                  deliveryDate: entry.value.first.deliveryDate,
                  items: entry.value,
                ),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 48, color: Colors.red),
              const SizedBox(height: 16),
              Text('Error loading orders', style: theme.textTheme.titleMedium),
              Text(err.toString(),
                  style: theme.textTheme.bodySmall,
                  textAlign: TextAlign.center),
            ],
          ),
        ),
      ),
    );
  }
}

class _OrderPreparedCard extends ConsumerWidget {
  final String orderId;
  final String? orderNumber;
  final String customerName;
  final DateTime? deliveryDate;
  final List<SalesOrderItem> items;

  const _OrderPreparedCard({
    required this.orderId,
    this.orderNumber,
    required this.customerName,
    this.deliveryDate,
    required this.items,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    String deliveryStr = 'ASAP';
    if (deliveryDate != null) {
      deliveryStr = DateFormat('MMM dd').format(deliveryDate!);
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 20),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(24),
        side: BorderSide(color: colorScheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Order #${orderNumber ?? orderId.split('-').last.toUpperCase()}',
                        style: theme.textTheme.labelLarge?.copyWith(
                          color: colorScheme.primary,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        customerName,
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
                _DeliveryIndicator(dateStr: deliveryStr),
              ],
            ),
          ),
          const Divider(height: 1),
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: items.length,
            separatorBuilder: (context, index) =>
                const Divider(height: 1, indent: 20, endIndent: 20),
            itemBuilder: (context, index) {
              final item = items[index];
              return _ItemRow(item: item);
            },
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

class _ItemRow extends ConsumerWidget {
  final SalesOrderItem item;

  const _ItemRow({required this.item});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final user = ref.watch(authStateProvider).value;

    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.productName,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    if (item.productSize != null || item.productColor != null)
                      Text(
                        '${item.productSize ?? ''} ${item.productColor ?? ''}'
                            .trim(),
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: colorScheme.onSurfaceVariant,
                        ),
                      ),
                  ],
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: colorScheme.secondaryContainer.withOpacity(0.3),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  '${item.quantity} ${item.unitType}',
                  style: theme.textTheme.labelMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
          if (item.isBackordered) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.warning_amber_rounded,
                    size: 14, color: Colors.orange),
                const SizedBox(width: 4),
                Text(
                  'Awaiting Production',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: Colors.orange,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ],
          if (item.notes != null && item.notes!.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              'Notes: ${item.notes}',
              style: theme.textTheme.bodySmall?.copyWith(
                fontStyle: FontStyle.italic,
              ),
            ),
          ],
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: item.isBackordered
                  ? null
                  : () async {
                      try {
                        await ref
                            .read(pendingOrdersProvider.notifier)
                            .prepareItem(
                              item.id,
                              factoryId: user?.factoryId,
                            );
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                                content: Text('Item marked as prepared')),
                          );
                        }
                      } catch (e) {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('Error: $e')),
                          );
                        }
                      }
                    },
              icon: Icon(
                item.isBackordered
                    ? Icons.hourglass_empty
                    : Icons.check_circle_outline,
                size: 18,
              ),
              label: Text(
                  item.isBackordered ? 'Awaiting Stock' : 'Mark as Prepared'),
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DeliveryIndicator extends StatelessWidget {
  final String dateStr;
  const _DeliveryIndicator({required this.dateStr});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: colorScheme.errorContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.event, size: 14, color: colorScheme.onErrorContainer),
          const SizedBox(width: 4),
          Text(
            dateStr,
            style: TextStyle(
              color: colorScheme.onErrorContainer,
              fontSize: 12,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}
