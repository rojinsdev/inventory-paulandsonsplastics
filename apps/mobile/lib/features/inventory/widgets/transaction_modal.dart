import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../providers/inventory_provider.dart';
import '../data/inventory_repository.dart';

class InventoryTransactionModal extends ConsumerWidget {
  final String? productId;
  final String productName;

  const InventoryTransactionModal({
    super.key,
    this.productId,
    required this.productName,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final transactionsAsync = ref.watch(inventoryTransactionsProvider(productId));

    return Container(
      height: MediaQuery.of(context).size.height * 0.7,
      decoration: BoxDecoration(
        color: colorScheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 12, bottom: 8),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: colorScheme.onSurfaceVariant.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(24.0),
            child: Row(
              children: [
                Icon(Icons.history, color: colorScheme.primary),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Audit Trail',
                        style: theme.textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        productName,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: transactionsAsync.when(
              data: (transactions) {
                if (transactions.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.history_outlined, size: 48, color: colorScheme.outlineVariant),
                        const SizedBox(height: 16),
                        const Text('No recent activities found'),
                      ],
                    ),
                  );
                }

                return ListView.separated(
                  padding: const EdgeInsets.all(24),
                  itemCount: transactions.length,
                  separatorBuilder: (context, index) => const SizedBox(height: 16),
                  itemBuilder: (context, index) {
                    final tx = transactions[index];
                    return _TransactionItem(tx: tx);
                  },
                );
              },
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (err, _) => Center(
                child: Text('Error: ${err.toString()}'),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TransactionItem extends StatelessWidget {
  final InventoryTransaction tx;

  const _TransactionItem({required this.tx});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final dateFormat = DateFormat('MMM dd, hh:mm a');

    // Logic for icon and color based on activity
    IconData icon;
    Color color;
    String actionLabel;
    String details;

    switch (tx.transactionType) {
      case 'pack':
        icon = Icons.inventory_2_outlined;
        color = Colors.blue;
        actionLabel = 'Packed';
        details = 'From Loose to ${tx.toState.toUpperCase()}';
        break;
      case 'bundle':
        icon = Icons.layers_outlined;
        color = Colors.purple;
        actionLabel = 'Bundled';
        details = 'From ${tx.fromState.toUpperCase()} to ${tx.unitType?.toUpperCase() ?? 'BUNDLE'}';
        break;
      case 'unpack':
        icon = Icons.unarchive_outlined;
        color = Colors.orange;
        actionLabel = 'Unpacked';
        details = 'Broken down from ${tx.fromState.toUpperCase()}';
        break;
      default:
        icon = Icons.sync_alt;
        color = colorScheme.outline;
        actionLabel = tx.transactionType.split('_').map((e) => e[0].toUpperCase() + e.substring(1)).join(' ');
        details = '${tx.fromState.toUpperCase()} -> ${tx.toState.toUpperCase()}';
    }

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, color: color, size: 20),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    actionLabel,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    '${tx.quantity.toInt()} units',
                    style: theme.textTheme.labelLarge?.copyWith(
                      color: color,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 2),
              Text(
                details,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: colorScheme.onSurfaceVariant,
                ),
              ),
              if (tx.note != null && tx.note!.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  tx.note!,
                  style: theme.textTheme.labelSmall?.copyWith(
                    fontStyle: FontStyle.italic,
                    color: colorScheme.onSurfaceVariant.withValues(alpha: 0.7),
                  ),
                ),
              ],
              const SizedBox(height: 4),
              Text(
                dateFormat.format(tx.createdAt),
                style: theme.textTheme.labelSmall?.copyWith(
                  color: colorScheme.outline,
                  fontSize: 10,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
