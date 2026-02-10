import 'package:flutter/material.dart';
import '../providers/inventory_provider.dart';

/// Redesigned premium stock summary card for use across dashboard and operations screens
class StockSummaryCard extends StatelessWidget {
  final List<InventoryStock> stocks;
  final VoidCallback? onTap;

  const StockSummaryCard({super.key, required this.stocks, this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    // Aggregate totals
    int totalSemiFinished = 0;
    int totalPacked = 0;
    int totalBundled = 0;

    for (final stock in stocks) {
      totalSemiFinished += stock.semiFinishedQty;
      totalPacked += stock.packedQty;
      totalBundled += stock.bundledQty;
    }

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            colorScheme.primary,
            colorScheme.primary.withValues(alpha: 0.8),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(32),
        boxShadow: [
          BoxShadow(
            color: colorScheme.primary.withOpacity(0.2),
            blurRadius: 20,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(32),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onTap,
            child: Stack(
              children: [
                // Subtle background pattern/glow
                Positioned(
                  right: -20,
                  top: -20,
                  child: Container(
                    width: 120,
                    height: 120,
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.1),
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(24.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Total Inventory',
                            style: theme.textTheme.titleMedium?.copyWith(
                              color: colorScheme.onPrimary.withOpacity(0.9),
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          Icon(
                            Icons.arrow_forward_ios,
                            size: 14,
                            color: colorScheme.onPrimary.withOpacity(0.7),
                          ),
                        ],
                      ),
                      const SizedBox(height: 24),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          StockItem(
                            label: 'Loose',
                            value: totalSemiFinished,
                            icon: Icons.grain_outlined,
                            textColor: colorScheme.onPrimary,
                          ),
                          Container(
                            width: 1,
                            height: 40,
                            color: colorScheme.onPrimary.withOpacity(0.2),
                          ),
                          StockItem(
                            label: 'Packets',
                            value: totalPacked,
                            icon: Icons.inventory_2_outlined,
                            textColor: colorScheme.onPrimary,
                          ),
                          Container(
                            width: 1,
                            height: 40,
                            color: colorScheme.onPrimary.withOpacity(0.2),
                          ),
                          StockItem(
                            label: 'Bundles',
                            value: totalBundled,
                            icon: Icons.layers_outlined,
                            textColor: colorScheme.onPrimary,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
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
  final Color textColor;

  const StockItem({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    required this.textColor,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      children: [
        Icon(icon, size: 20, color: textColor.withOpacity(0.8)),
        const SizedBox(height: 8),
        Text(
          value.toString(),
          style: theme.textTheme.headlineSmall?.copyWith(
            color: textColor,
            fontWeight: FontWeight.bold,
          ),
        ),
        Text(
          label,
          style: theme.textTheme.labelSmall?.copyWith(
            color: textColor.withOpacity(0.7),
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
        color: colorScheme.surfaceContainerHighest.withOpacity(0.5),
        borderRadius: BorderRadius.circular(32),
        border: Border.all(color: colorScheme.outlineVariant.withOpacity(0.5)),
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
        color: colorScheme.errorContainer.withOpacity(0.4),
        borderRadius: BorderRadius.circular(32),
        border: Border.all(color: colorScheme.error.withOpacity(0.2)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: colorScheme.error.withOpacity(0.1),
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
                  'Unable to fetch latest stock',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
          IconButton.filledTonal(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh, size: 20),
            style: IconButton.styleFrom(
              backgroundColor: colorScheme.error.withOpacity(0.1),
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
        color: colorScheme.surfaceContainerHighest.withOpacity(0.3),
        borderRadius: BorderRadius.circular(32),
        border: Border.all(color: colorScheme.outlineVariant.withOpacity(0.5)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: colorScheme.primary.withOpacity(0.05),
              shape: BoxShape.circle,
            ),
            child: Icon(Icons.inventory_2_outlined,
                color: colorScheme.primary.withOpacity(0.5)),
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
