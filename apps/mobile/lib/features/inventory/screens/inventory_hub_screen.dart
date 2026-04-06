import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../production/providers/production_request_provider.dart';
import '../../production/providers/sales_order_provider.dart';
import '../providers/inventory_provider.dart';
import '../widgets/stock_summary_card.dart';

class InventoryHubScreen extends ConsumerWidget {
  const InventoryHubScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(inventoryStockProvider);
          ref.invalidate(capStockProvider);
          ref.invalidate(innerStockProvider);
          ref.invalidate(productionRequestsProvider);
          ref.invalidate(pendingOrdersProvider);
        },
        child: CustomScrollView(
          slivers: [
            SliverAppBar.large(
              title: Text(
                'Operations',
                style: theme.textTheme.headlineLarge?.copyWith(
                  color: colorScheme.onSurface,
                ),
              ),
              backgroundColor: colorScheme.surface,
              scrolledUnderElevation: 0,
              floating: true,
              pinned: true,
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Monitoring',
                      style: theme.textTheme.titleMedium?.copyWith(
                        color: colorScheme.primary,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Consumer(
                      builder: (context, ref, child) {
                        final stockAsync = ref.watch(inventoryStockProvider);
                        final capStockAsync = ref.watch(capStockProvider);
                        final innerStockAsync = ref.watch(innerStockProvider);

                        if (stockAsync.isLoading ||
                            capStockAsync.isLoading ||
                            innerStockAsync.isLoading) {
                          return const StockLoadingCard();
                        }

                        if (stockAsync.hasError ||
                            capStockAsync.hasError ||
                            innerStockAsync.hasError) {
                          return StockErrorCard(
                            error: (stockAsync.error ??
                                    capStockAsync.error ??
                                    innerStockAsync.error ??
                                    'Unknown error')
                                .toString(),
                            onRetry: () {
                              ref.invalidate(inventoryStockProvider);
                              ref.invalidate(capStockProvider);
                              ref.invalidate(innerStockProvider);
                            },
                          );
                        }

                        final stocks = stockAsync.valueOrNull ?? [];
                        final capStocks = capStockAsync.valueOrNull ?? [];
                        final innerStocks = innerStockAsync.valueOrNull ?? [];

                        if (stocks.isEmpty &&
                            capStocks.isEmpty &&
                            innerStocks.isEmpty) {
                          return const StockEmptyCard();
                        }

                        return StockSummaryCard(
                          stocks: stocks,
                          capStocks: capStocks,
                          innerStocks: innerStocks,
                          onTap: () => context.push('/stock-details'),
                        );
                      },
                    ),
                    const SizedBox(height: 32),
                    Text(
                      'Logistics & Requests',
                      style: theme.textTheme.titleMedium?.copyWith(
                        color: colorScheme.primary,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Consumer(
                      builder: (context, ref, child) {
                        final requestsState =
                            ref.watch(productionRequestsProvider);
                        final pendingCount = requestsState.when(
                          data: (items) => items
                              .where((item) => item.status == 'pending')
                              .length,
                          loading: () => null,
                          error: (_, __) => null,
                        );

                        return _InventoryActionCard(
                          title: 'Tub Production Requests',
                          subtitle: pendingCount != null
                              ? '$pendingCount requests pending'
                              : 'Manage tub requests',
                          icon: Icons.assignment_outlined,
                          containerColor: colorScheme.secondaryContainer,
                          onTap: () => context.push('/production/requests'),
                          trailing: pendingCount != null && pendingCount > 0
                              ? Container(
                                  padding: const EdgeInsets.all(8),
                                  decoration: BoxDecoration(
                                    color: colorScheme.error,
                                    shape: BoxShape.circle,
                                  ),
                                  child: Text(
                                    pendingCount.toString(),
                                    style: theme.textTheme.labelSmall?.copyWith(
                                      color: colorScheme.onError,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                )
                              : null,
                        );
                      },
                    ),
                    const SizedBox(height: 16),
                    Consumer(
                      builder: (context, ref, child) {
                        final ordersState = ref.watch(pendingOrdersProvider);
                        final pendingCount = ordersState.when(
                          data: (items) =>
                              items.where((item) => !item.isPrepared).length,
                          loading: () => null,
                          error: (_, __) => null,
                        );

                        return _InventoryActionCard(
                          title: 'Order Prep',
                          subtitle: pendingCount != null
                              ? '$pendingCount items to pack'
                              : 'Mark orders as prepared',
                          icon: Icons.checklist_rtl_outlined,
                          containerColor: colorScheme.primaryContainer,
                          onTap: () => context.push('/production/preparation'),
                          trailing: pendingCount != null && pendingCount > 0
                              ? Container(
                                  padding: const EdgeInsets.all(8),
                                  decoration: BoxDecoration(
                                    color: colorScheme.error,
                                    shape: BoxShape.circle,
                                  ),
                                  child: Text(
                                    pendingCount.toString(),
                                    style: theme.textTheme.labelSmall?.copyWith(
                                      color: colorScheme.onError,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                )
                              : null,
                        );
                      },
                    ),
                    const SizedBox(height: 16),
                    _InventoryActionCard(
                      title: 'Raw Materials',
                      subtitle: 'Check stock & consumption',
                      icon: Icons.grain_outlined,
                      containerColor: colorScheme.tertiaryContainer,
                      onTap: () => context.push('/inventory/raw-materials'),
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

class _InventoryActionCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final IconData icon;
  final Color containerColor;
  final VoidCallback onTap;
  final Widget? trailing;

  const _InventoryActionCard({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.containerColor,
    required this.onTap,
    this.trailing,
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
                if (trailing != null) ...[
                  const SizedBox(width: 12),
                  trailing!,
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
