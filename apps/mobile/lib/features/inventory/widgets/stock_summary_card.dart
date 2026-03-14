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
  bool _showCaps = false;

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
            onTap: widget.onTap,
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
                          // Tab Switcher
                          Container(
                            decoration: BoxDecoration(
                              color: Colors.black.withOpacity(0.2),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            padding: const EdgeInsets.all(4),
                            child: Row(
                              children: [
                                _buildTab(context, 'Products', !_showCaps),
                                _buildTab(context, 'Caps', _showCaps),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 24),
                      if (!_showCaps) ...[
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Expanded(
                              child: StockItem(
                                label: 'Loose',
                                value: totalSemiFinished,
                                icon: Icons.grain_outlined,
                                textColor: colorScheme.onPrimary,
                              ),
                            ),
                            Container(
                              width: 1,
                              height: 40,
                              color: colorScheme.onPrimary.withOpacity(0.2),
                            ),
                            Expanded(
                              child: StockItem(
                                label: 'Packets',
                                value: totalPacked,
                                icon: Icons.inventory_2_outlined,
                                textColor: colorScheme.onPrimary,
                              ),
                            ),
                            Container(
                              width: 1,
                              height: 40,
                              color: colorScheme.onPrimary.withOpacity(0.2),
                            ),
                            Expanded(
                              child: StockItem(
                                label: 'Bundles',
                                value: totalBundled,
                                icon: Icons.layers_outlined,
                                textColor: colorScheme.onPrimary,
                              ),
                            ),
                          ],
                        ),
                        if (widget.stocks.isNotEmpty) ...[
                          const SizedBox(height: 24),
                          Container(
                            height: 1,
                            color: Colors.white.withOpacity(0.1),
                          ),
                          const SizedBox(height: 16),
                          Text(
                            'Top Product Variants',
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: Colors.white.withOpacity(0.6),
                              fontWeight: FontWeight.bold,
                              letterSpacing: 1.0,
                            ),
                          ),
                          const SizedBox(height: 12),
                          ...widget.stocks.take(3).map((stock) => Padding(
                                padding: const EdgeInsets.only(bottom: 8.0),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        stock.displayName,
                                        style:
                                            theme.textTheme.bodySmall?.copyWith(
                                          color: Colors.white,
                                          fontWeight: FontWeight.w500,
                                        ),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Text(
                                      '${stock.bundledQty}B / ${stock.packedQty}P',
                                      style:
                                          theme.textTheme.labelSmall?.copyWith(
                                        color: Colors.white.withOpacity(0.8),
                                        fontFamily: 'monospace',
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ],
                                ),
                              )),
                        ],
                      ] else ...[
                        Center(
                          child: StockItem(
                            label: 'Total Loose Caps',
                            value: totalCaps,
                            icon: Icons.radio_button_checked,
                            textColor: colorScheme.onPrimary,
                          ),
                        ),
                        if (widget.capStocks.isNotEmpty) ...[
                          const SizedBox(height: 24),
                          Container(
                            height: 1,
                            color: Colors.white.withOpacity(0.1),
                          ),
                          const SizedBox(height: 16),
                          Text(
                            'Cap Breakdown',
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: Colors.white.withOpacity(0.6),
                              fontWeight: FontWeight.bold,
                              letterSpacing: 1.0,
                            ),
                          ),
                          const SizedBox(height: 12),
                          ...widget.capStocks.take(3).map((cap) => Padding(
                                padding: const EdgeInsets.only(bottom: 8.0),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        '${cap.capName} (${cap.color ?? 'N/A'})',
                                        style:
                                            theme.textTheme.bodySmall?.copyWith(
                                          color: Colors.white,
                                          fontWeight: FontWeight.w500,
                                        ),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Text(
                                      cap.quantity.toString(),
                                      style:
                                          theme.textTheme.labelSmall?.copyWith(
                                        color: Colors.white.withOpacity(0.8),
                                        fontFamily: 'monospace',
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ],
                                ),
                              )),
                        ],
                      ],
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

  Widget _buildTab(BuildContext context, String label, bool isSelected) {
    return GestureDetector(
      onTap: () {
        setState(() {
          _showCaps = label == 'Caps';
        });
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color:
              isSelected ? Colors.white.withOpacity(0.2) : Colors.transparent,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Text(
          label,
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color:
                    isSelected ? Colors.white : Colors.white.withOpacity(0.6),
                fontWeight: FontWeight.bold,
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
