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

class _OrderPreparedCard extends StatefulWidget {
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
  State<_OrderPreparedCard> createState() => _OrderPreparedCardState();
}

class _OrderPreparedCardState extends State<_OrderPreparedCard> {
  final Map<String, TextEditingController> _controllers = {};

  @override
  void initState() {
    super.initState();
    for (final item in widget.items) {
      if (!item.isBackordered) {
        final remaining = item.quantity - item.quantityPrepared;
        _controllers[item.id] =
            TextEditingController(text: remaining > 0 ? remaining.toString() : '0');
      }
    }
  }

  @override
  void dispose() {
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Consumer(builder: (context, ref, child) {
      final theme = Theme.of(context);
      final colorScheme = theme.colorScheme;
      final user = ref.watch(authStateProvider).value;

      String deliveryStr = 'ASAP';
      if (widget.deliveryDate != null) {
        deliveryStr = DateFormat('MMM dd').format(widget.deliveryDate!);
      }

      // Check if any items are actually Forward-able (not backordered and have remaining qty)
      final canForward = _controllers.isNotEmpty;

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
                          'Order #${widget.orderNumber ?? widget.orderId.split('-').last.toUpperCase()}',
                          style: theme.textTheme.labelLarge?.copyWith(
                            color: colorScheme.primary,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Text(
                          widget.customerName,
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
              itemCount: widget.items.length,
              separatorBuilder: (context, index) =>
                  const Divider(height: 1, indent: 20, endIndent: 20),
              itemBuilder: (context, index) {
                final item = widget.items[index];
                return _ItemRow(
                  item: item,
                  controller: _controllers[item.id],
                );
              },
            ),
            if (canForward) ...[
              const Divider(height: 1),
              Padding(
                padding: const EdgeInsets.all(20),
                child: SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: () async {
                      final List<Map<String, dynamic>> itemsToPrepare = [];
                      bool hasInvalidInput = false;

                      for (final item in widget.items) {
                        final controller = _controllers[item.id];
                        if (controller == null) continue;

                        final qty = int.tryParse(controller.text) ?? 0;
                        if (qty > 0) {
                          final remaining = item.quantity - item.quantityPrepared;
                          if (qty > remaining) {
                            hasInvalidInput = true;
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                    content: Text(
                                        'Quantity for ${item.productName} exceeds remaining order.')),
                              );
                            }
                            break;
                          }
                          itemsToPrepare.add({
                            'item_id': item.id,
                            'quantity': qty,
                          });
                        }
                      }

                      if (hasInvalidInput) return;
                      if (itemsToPrepare.isEmpty) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                              content: Text('Please enter quantities to prepare.')),
                        );
                        return;
                      }

                      try {
                        await ref
                            .read(pendingOrdersProvider.notifier)
                            .prepareOrderItems(
                              widget.orderId,
                              itemsToPrepare,
                              factoryId: user?.factoryId,
                            );
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                                content: Text('Items forwarded for dispatch')),
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
                    icon: const Icon(Icons.rocket_launch_outlined),
                    label: const Text('Forward Selection to Dispatch'),
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                  ),
                ),
              ),
            ],
            const SizedBox(height: 8),
          ],
        ),
      );
    });
  }
}

class _ItemRow extends StatelessWidget {
  final SalesOrderItem item;
  final TextEditingController? controller;

  const _ItemRow({required this.item, this.controller});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final remaining = item.quantity - item.quantityPrepared;

    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
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
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: colorScheme.secondaryContainer.withOpacity(0.3),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      'Total: ${item.quantity} ${item.unitType}',
                      style: theme.textTheme.labelMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  if (item.quantityPrepared > 0)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        'Prepared: ${item.quantityPrepared}',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: colorScheme.primary,
                        ),
                      ),
                    ),
                ],
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
          ] else ...[
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Qty to Prepare',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: colorScheme.onSurfaceVariant,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 8),
                      SizedBox(
                        height: 48,
                        child: TextField(
                          controller: controller,
                          keyboardType: TextInputType.number,
                          decoration: InputDecoration(
                            hintText: '0',
                            contentPadding: const EdgeInsets.symmetric(
                                horizontal: 16, vertical: 8),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 16),
                Padding(
                  padding: const EdgeInsets.only(top: 24),
                  child: Text(
                    '/ $remaining Remaining',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: colorScheme.outline,
                    ),
                  ),
                ),
              ],
            ),
          ],
          if (item.notes != null && item.notes!.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              'Notes: ${item.notes}',
              style: theme.textTheme.bodySmall?.copyWith(
                fontStyle: FontStyle.italic,
              ),
            ),
          ],
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
