import 'package:flutter/material.dart';
import '../providers/inventory_provider.dart';
import '../providers/cap_stock_model.dart';

/// Redesigned premium stock summary card for use across dashboard and operations screens
class StockSummaryCard extends StatefulWidget {
  final List<InventoryStock> stocks;
  final List<CapStock> capStocks;
  final VoidCallback? onTap;

  const StockSummaryCard({
    super.key,
    required this.stocks,
    this.capStocks = const [],
    this.onTap,
  });

  @override
  State<StockSummaryCard> createState() => _StockSummaryCardState();
}

class _StockSummaryCardState extends State<StockSummaryCard> {

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    // Aggregate totals for Products
    int totalSemiFinished = 0;
    int totalPacked = 0;
    int totalBundled = 0;

    for (final stock in widget.stocks) {
      totalSemiFinished += stock.semiFinishedQty;
      totalPacked += stock.packedQty;
      totalBundled += stock.bundledQty;
    }

    // Aggregate totals for Caps
    int totalCaps = 0;
    for (final cap in widget.capStocks) {
      totalCaps += cap.quantity;
    }

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(24),
        side: BorderSide(
          color: colorScheme.outlineVariant.withValues(alpha: 0.5),
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: widget.onTap,
        child: Padding(
          padding: const EdgeInsets.all(20.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Current Stock Summary',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: colorScheme.onSurface,
                    ),
                  ),
                  Icon(Icons.inventory_2_outlined, 
                       size: 20, 
                       color: colorScheme.primary.withValues(alpha: 0.5)),
                ],
              ),
              const SizedBox(height: 24),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  StockItem(
                    label: 'Loose',
                    value: totalSemiFinished,
                    icon: Icons.grain_outlined,
                  ),
                  StockItem(
                    label: 'Packets',
                    value: totalPacked,
                    icon: Icons.inventory_2_outlined,
                  ),
                  StockItem(
                    label: 'Bundles',
                    value: totalBundled,
                    icon: Icons.layers_outlined,
                  ),
                  StockItem(
                    label: 'Caps',
                    value: totalCaps,
                    icon: Icons.radio_button_checked,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class StockItem extends StatelessWidget {
  final String label;
  final int value;
  final IconData icon;

  const StockItem({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Column(
      children: [
        Icon(icon, size: 20, color: colorScheme.primary.withValues(alpha: 0.5)),
        const SizedBox(height: 8),
        Text(
          value.toString(),
          style: theme.textTheme.headlineSmall?.copyWith(
            color: colorScheme.onSurface,
            fontWeight: FontWeight.bold,
          ),
        ),
        Text(
          label,
          style: theme.textTheme.labelSmall?.copyWith(
            color: colorScheme.onSurfaceVariant,
            letterSpacing: 0.5,
          ),
        ),
      ],
    );
  }
}

class StockLoadingCard extends StatelessWidget {
  const StockLoadingCard({super.key});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Container(
      height: 160,
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerHighest.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(32),
        border: Border.all(color: colorScheme.outlineVariant.withValues(alpha: 0.1)),
      ),
      child: const Center(
        child: CircularProgressIndicator(),
      ),
    );
  }
}

class StockErrorCard extends StatelessWidget {
  final String error;
  final VoidCallback onRetry;

  const StockErrorCard({super.key, required this.error, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: colorScheme.errorContainer.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(32),
        border: Border.all(color: colorScheme.error.withValues(alpha: 0.1)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: colorScheme.error.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: Icon(Icons.error_outline, color: colorScheme.error),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Connection Issue',
                  style: theme.textTheme.titleSmall?.copyWith(
                    color: colorScheme.error,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  error.contains('Exception:')
                      ? error.replaceFirst('Exception: ', '')
                      : error,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: colorScheme.onSurfaceVariant,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          IconButton.filledTonal(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh, size: 20),
            style: IconButton.styleFrom(
              backgroundColor: colorScheme.error.withValues(alpha: 0.1),
              foregroundColor: colorScheme.error,
            ),
          ),
        ],
      ),
    );
  }
}

class StockEmptyCard extends StatelessWidget {
  const StockEmptyCard({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerHighest.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(32),
        border: Border.all(color: colorScheme.outlineVariant.withValues(alpha: 0.1)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: colorScheme.primary.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: Icon(Icons.inventory_2_outlined,
                color: colorScheme.primary.withValues(alpha: 0.1)),
          ),
          const SizedBox(width: 16),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'No Stock Data',
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
              Text(
                'Inventory is currently empty',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
