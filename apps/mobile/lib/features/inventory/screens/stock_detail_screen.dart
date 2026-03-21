import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../widgets/unpack_modal.dart';
import '../providers/inventory_provider.dart';
import '../providers/cap_stock_model.dart';

class StockDetailScreen extends ConsumerStatefulWidget {
  const StockDetailScreen({super.key});

  @override
  ConsumerState<StockDetailScreen> createState() => _StockDetailScreenState();
}

class _StockDetailScreenState extends ConsumerState<StockDetailScreen> {
  final _searchController = TextEditingController();
  String _searchQuery = '';
  int _selectedTabIndex = 0; // 0: Products, 1: Caps

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final stockAsync = ref.watch(inventoryStockProvider);
    final capStockAsync = ref.watch(capStockProvider);

    return Scaffold(
      backgroundColor: colorScheme.surface,
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(inventoryStockProvider);
          ref.invalidate(capStockProvider);
        },
        child: CustomScrollView(
          slivers: [
            SliverAppBar(
              expandedHeight: 220,
              collapsedHeight: 140,
              pinned: true,
              backgroundColor: colorScheme.surface,
              surfaceTintColor: colorScheme.surface,
              title: Text(
                'Stock Overview',
                style: theme.textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                  letterSpacing: -0.5,
                ),
              ),
              bottom: PreferredSize(
                preferredSize: const Size.fromHeight(130),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(24, 0, 24, 16),
                  child: Column(
                    children: [
                      // Search Bar
                      Container(
                        height: 56,
                        decoration: BoxDecoration(
                          color: colorScheme.surfaceContainerHighest.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                            color: colorScheme.outlineVariant.withValues(alpha: 0.1),
                          ),
                        ),
                        child: TextField(
                          controller: _searchController,
                          onChanged: (value) =>
                              setState(() => _searchQuery = value),
                          decoration: InputDecoration(
                            hintText: _selectedTabIndex == 0
                                ? 'Search products...'
                                : 'Search caps...',
                            prefixIcon: const Icon(Icons.search, size: 20),
                            suffixIcon: _searchQuery.isNotEmpty
                                ? IconButton(
                                    icon: const Icon(Icons.clear, size: 20),
                                    onPressed: () {
                                      _searchController.clear();
                                      setState(() => _searchQuery = '');
                                    },
                                  )
                                : null,
                            border: InputBorder.none,
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 16,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      // Tab Switcher
                      Container(
                        height: 48,
                        padding: const EdgeInsets.all(4),
                        decoration: BoxDecoration(
                          color: colorScheme.surfaceContainerHighest.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: _buildTab(
                                context,
                                'Products',
                                _selectedTabIndex == 0,
                                () => setState(() => _selectedTabIndex = 0),
                              ),
                            ),
                            Expanded(
                              child: _buildTab(
                                context,
                                'Caps',
                                _selectedTabIndex == 1,
                                () => setState(() => _selectedTabIndex = 1),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),

            // Stock List
            if (_selectedTabIndex == 0)
              stockAsync.when(
                loading: () => const SliverFillRemaining(
                  child: Center(child: CircularProgressIndicator()),
                ),
                error: (err, _) => SliverFillRemaining(
                  child: Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.error_outline,
                            size: 48, color: colorScheme.error),
                        const SizedBox(height: 16),
                        Text('Error loading product stock',
                            style: theme.textTheme.titleMedium),
                        TextButton(
                          onPressed: () =>
                              ref.invalidate(inventoryStockProvider),
                          child: const Text('Retry'),
                        ),
                      ],
                    ),
                  ),
                ),
                data: (stocks) {
                  final filteredStocks = stocks
                      .where((s) => s.displayName
                          .toLowerCase()
                          .contains(_searchQuery.toLowerCase()))
                      .toList();

                  if (filteredStocks.isEmpty) {
                    return const SliverFillRemaining(
                      child: Center(child: Text('No products found')),
                    );
                  }

                  return SliverPadding(
                    padding: const EdgeInsets.fromLTRB(24, 0, 24, 40),
                    sliver: SliverList(
                      delegate: SliverChildBuilderDelegate(
                        (context, index) {
                          return _ProductStockCard(
                              stock: filteredStocks[index]);
                        },
                        childCount: filteredStocks.length,
                      ),
                    ),
                  );
                },
              )
            else
              capStockAsync.when(
                loading: () => const SliverFillRemaining(
                  child: Center(child: CircularProgressIndicator()),
                ),
                error: (err, _) => SliverFillRemaining(
                  child: Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.error_outline,
                            size: 48, color: colorScheme.error),
                        const SizedBox(height: 16),
                        Text('Error loading cap stock',
                            style: theme.textTheme.titleMedium),
                        TextButton(
                          onPressed: () => ref.invalidate(capStockProvider),
                          child: const Text('Retry'),
                        ),
                      ],
                    ),
                  ),
                ),
                data: (caps) {
                  final filteredCaps = caps
                      .where((c) => c.capName
                          .toLowerCase()
                          .contains(_searchQuery.toLowerCase()))
                      .toList();

                  if (filteredCaps.isEmpty) {
                    return const SliverFillRemaining(
                      child: Center(child: Text('No caps found')),
                    );
                  }

                  return SliverPadding(
                    padding: const EdgeInsets.fromLTRB(24, 0, 24, 40),
                    sliver: SliverList(
                      delegate: SliverChildBuilderDelegate(
                        (context, index) {
                          return _CapStockCard(cap: filteredCaps[index]);
                        },
                        childCount: filteredCaps.length,
                      ),
                    ),
                  );
                },
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildTab(
      BuildContext context, String label, bool isSelected, VoidCallback onTap) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: isSelected ? colorScheme.primary : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Center(
          child: Text(
            label,
            style: theme.textTheme.titleSmall?.copyWith(
              color: isSelected
                  ? colorScheme.onPrimary
                  : colorScheme.onSurfaceVariant,
              fontWeight: FontWeight.bold,
            ),
          ),
        ),
      ),
    );
  }
}

class _ProductStockCard extends StatelessWidget {
  final InventoryStock stock;

  const _ProductStockCard({required this.stock});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: colorScheme.outlineVariant.withValues(alpha: 0.1),
        ),
      ),
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
                      stock.displayName,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'ID: ${stock.productId}',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: colorScheme.onSurfaceVariant.withValues(alpha: 0.6),
                      ),
                    ),
                  ],
                ),
              ),
              IconButton.filledTonal(
                onPressed: () {
                  showModalBottomSheet(
                    context: context,
                    isScrollControlled: true,
                    backgroundColor: Colors.transparent,
                    builder: (context) => UnpackModal(stock: stock),
                  );
                },
                icon: const Icon(Icons.unarchive_outlined, size: 20),
                tooltip: 'Unpack Items',
                style: IconButton.styleFrom(
                  minimumSize: const Size(40, 40),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _CompactIndicator(
                label: 'Loose',
                value: stock.semiFinishedQty,
                color: colorScheme.tertiary,
              ),
              const SizedBox(width: 8),
              _CompactIndicator(
                label: 'Packets',
                value: stock.packedQty,
                color: colorScheme.secondary,
              ),
              const SizedBox(width: 8),
              _CompactIndicator(
                label: stock.unitType == null || stock.unitType!.isEmpty
                    ? 'Bundles'
                    : '${stock.unitType![0].toUpperCase()}${stock.unitType!.substring(1)}s',
                value: stock.bundledQty,
                color: colorScheme.primary,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CapStockCard extends StatelessWidget {
  final CapStock cap;

  const _CapStockCard({required this.cap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: colorScheme.outlineVariant.withValues(alpha: 0.1),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            cap.capName,
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          if (cap.color != null) ...[
            const SizedBox(height: 4),
            Text(
              'Color: ${cap.color}',
              style: theme.textTheme.labelSmall?.copyWith(
                color: colorScheme.onSurfaceVariant.withValues(alpha: 0.6),
              ),
            ),
          ],
          const SizedBox(height: 12),
          _CompactIndicator(
            label: 'Total Loose',
            value: cap.quantity,
            color: colorScheme.tertiary,
          ),
        ],
      ),
    );
  }
}

class _CompactIndicator extends StatelessWidget {
  final String label;
  final int value;
  final Color color;

  const _CompactIndicator({
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            value.toString(),
            style: theme.textTheme.labelLarge?.copyWith(
              color: color,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(width: 4),
          Text(
            label,
            style: theme.textTheme.labelSmall?.copyWith(
              color: color.withValues(alpha: 0.6),
            ),
          ),
        ],
      ),
    );
  }
}
