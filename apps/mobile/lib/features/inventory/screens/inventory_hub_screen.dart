import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/inventory_provider.dart';

class InventoryHubScreen extends ConsumerWidget {
  const InventoryHubScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final stockAsync = ref.watch(inventoryStockProvider);

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(inventoryStockProvider);
        },
        child: CustomScrollView(
          slivers: [
            SliverAppBar.large(
              title: Text(
                'Inventory',
                style: theme.textTheme.headlineLarge?.copyWith(
                  color: colorScheme.onSurface,
                ),
              ),
              backgroundColor: colorScheme.surface,
              scrolledUnderElevation: 0,
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Stock Summary Section (Read-Only)
                    Text(
                      'Current Stock',
                      style: theme.textTheme.titleMedium?.copyWith(
                        color: colorScheme.primary,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 12),

                    stockAsync.when(
                      loading: () => const _StockLoadingCard(),
                      error: (e, _) => _StockErrorCard(
                        error: e.toString(),
                        onRetry: () => ref.invalidate(inventoryStockProvider),
                      ),
                      data: (stocks) => stocks.isEmpty
                          ? const _StockEmptyCard()
                          : _StockSummaryCard(stocks: stocks),
                    ),

                    const SizedBox(height: 32),

                    Text(
                      'Actions',
                      style: theme.textTheme.titleMedium?.copyWith(
                        color: colorScheme.primary,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Expressive Cards
                    _InventoryActionCard(
                      title: 'Packing Entry',
                      subtitle: 'Convert Semi-Finished to Packed goods',
                      icon: Icons.inventory_2_outlined,
                      containerColor: colorScheme.secondaryContainer,
                      onTap: () => context.push('/inventory/pack'),
                    ),
                    const SizedBox(height: 16),

                    _InventoryActionCard(
                      title: 'Bundling Entry',
                      subtitle: 'Convert Packed goods to Finished bundles',
                      icon: Icons.layers_outlined,
                      containerColor: colorScheme.tertiaryContainer,
                      onTap: () => context.push('/inventory/bundle'),
                    ),
                    const SizedBox(height: 80),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Read-only stock summary card
class _StockSummaryCard extends StatelessWidget {
  final List<InventoryStock> stocks;

  const _StockSummaryCard({required this.stocks});

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
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: colorScheme.outlineVariant),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: _StockTile(
                  label: 'Semi-Finished',
                  value: totalSemiFinished,
                  icon: Icons.precision_manufacturing_outlined,
                  color: colorScheme.tertiary,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: _StockTile(
                  label: 'Packed',
                  value: totalPacked,
                  icon: Icons.inventory_2_outlined,
                  color: colorScheme.secondary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _StockTile(
                  label: 'Bundled',
                  value: totalBundled,
                  icon: Icons.layers_outlined,
                  color: colorScheme.primary,
                ),
              ),
              const Expanded(child: SizedBox()),
            ],
          ),
        ],
      ),
    );
  }
}

class _StockTile extends StatelessWidget {
  final String label;
  final int value;
  final IconData icon;
  final Color color;

  const _StockTile({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, size: 18, color: color),
            const SizedBox(width: 8),
            Text(
              label,
              style: theme.textTheme.bodySmall?.copyWith(
                color: colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          value.toString(),
          style: theme.textTheme.headlineMedium?.copyWith(
            color: colorScheme.onSurface,
            fontWeight: FontWeight.bold,
          ),
        ),
      ],
    );
  }
}

class _StockLoadingCard extends StatelessWidget {
  const _StockLoadingCard();

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Container(
      height: 140,
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(20),
      ),
      child: const Center(
        child: CircularProgressIndicator(),
      ),
    );
  }
}

class _StockErrorCard extends StatelessWidget {
  final String error;
  final VoidCallback onRetry;

  const _StockErrorCard({required this.error, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: colorScheme.errorContainer,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        children: [
          Icon(Icons.error_outline, color: colorScheme.onErrorContainer),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              'Unable to load stock',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: colorScheme.onErrorContainer,
              ),
            ),
          ),
          IconButton(
            onPressed: onRetry,
            icon: Icon(Icons.refresh, color: colorScheme.onErrorContainer),
          ),
        ],
      ),
    );
  }
}

class _StockEmptyCard extends StatelessWidget {
  const _StockEmptyCard();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: colorScheme.outlineVariant),
      ),
      child: Row(
        children: [
          Icon(Icons.inventory, color: colorScheme.onSurfaceVariant),
          const SizedBox(width: 12),
          Text(
            'No stock data available',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

class _InventoryActionCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final IconData icon;
  final Color containerColor;
  final VoidCallback onTap;

  const _InventoryActionCard({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.containerColor,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    Color onContainerColor;
    if (containerColor == colorScheme.primaryContainer) {
      onContainerColor = colorScheme.onPrimaryContainer;
    } else if (containerColor == colorScheme.secondaryContainer) {
      onContainerColor = colorScheme.onSecondaryContainer;
    } else {
      onContainerColor = colorScheme.onTertiaryContainer;
    }

    return Container(
      decoration: BoxDecoration(
        color: containerColor,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(24),
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style:
                            Theme.of(context).textTheme.headlineSmall?.copyWith(
                                  color: onContainerColor,
                                  fontWeight: FontWeight.bold,
                                ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        subtitle,
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                              color: onContainerColor.withValues(alpha: 0.8),
                            ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 16),
                Icon(icon, size: 40, color: onContainerColor),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
