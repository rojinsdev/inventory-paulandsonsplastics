import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../auth/providers/auth_provider.dart';
import '../providers/production_provider.dart';
import '../data/models/production_history_model.dart';

class ProductionHistoryScreen extends ConsumerStatefulWidget {
  const ProductionHistoryScreen({super.key});

  @override
  ConsumerState<ProductionHistoryScreen> createState() => _ProductionHistoryScreenState();
}

class _ProductionHistoryScreenState extends ConsumerState<ProductionHistoryScreen> {
  String? _selectedType;
  final ScrollController _scrollController = ScrollController();
  bool _isLoadingMore = false;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 200) {
      _loadMore();
    }
  }

  Future<void> _loadMore() async {
    final user = ref.read(authStateProvider).value;
    if (user == null || _isLoadingMore) return;

    final historyAsync = ref.read(productionHistoryListProvider(ProductionHistoryParams(
      userId: user.id,
      itemType: _selectedType,
    )));

    historyAsync.whenData((data) {
      if (data.page < data.totalPages) {
        setState(() => _isLoadingMore = true);
        ref.read(productionHistoryListProvider(ProductionHistoryParams(
          userId: user.id,
          itemType: _selectedType,
        )).notifier).fetch(page: data.page + 1).then((_) {
          setState(() => _isLoadingMore = false);
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authStateProvider).value;
    if (user == null) return const Scaffold(body: Center(child: Text('Please login')));

    final historyAsync = ref.watch(productionHistoryListProvider(ProductionHistoryParams(
      userId: user.id,
      itemType: _selectedType,
    )));

    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Scaffold(
      backgroundColor: colorScheme.surface,
      appBar: AppBar(
        title: const Text('My Production History'),
        centerTitle: false,
        scrolledUnderElevation: 0,
        actions: [
          IconButton(
            onPressed: () {
              ref.invalidate(productionHistoryListProvider(ProductionHistoryParams(
                userId: user.id,
                itemType: _selectedType,
              )));
            },
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: Column(
        children: [
          _buildFilters(colorScheme),
          Expanded(
            child: historyAsync.when(
              data: (data) => _buildHistoryList(data, colorScheme, theme),
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (err, stack) => Center(child: Text('Error: $err')),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilters(ColorScheme colorScheme) {
    final types = [
      {'label': 'All', 'value': null},
      {'label': 'Tubs', 'value': 'tub'},
      {'label': 'Caps', 'value': 'cap'},
      {'label': 'Inners', 'value': 'inner'},
      {'label': 'Packing', 'value': 'packing'},
      {'label': 'Bundling', 'value': 'bundling'},
    ];

    return Container(
      height: 60,
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        scrollDirection: Axis.horizontal,
        itemCount: types.length,
        separatorBuilder: (context, index) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final type = types[index];
          final isSelected = _selectedType == type['value'];
          return ChoiceChip(
            label: Text(type['label']!),
            selected: isSelected,
            onSelected: (selected) {
              setState(() {
                _selectedType = type['value'];
              });
            },
          );
        },
      ),
    );
  }

  Widget _buildHistoryList(ProductionHistoryResponse data, ColorScheme colorScheme, ThemeData theme) {
    if (data.logs.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.history_outlined, size: 64, color: colorScheme.outline.withValues(alpha: 0.5)),
            const SizedBox(height: 16),
            Text(
              'No production activity found',
              style: theme.textTheme.titleMedium?.copyWith(color: colorScheme.outline),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () async {
        final user = ref.read(authStateProvider).value;
        if (user != null) {
          ref.invalidate(productionHistoryListProvider(ProductionHistoryParams(
            userId: user.id,
            itemType: _selectedType,
          )));
        }
      },
      child: ListView.builder(
        controller: _scrollController,
        padding: const EdgeInsets.all(16),
        itemCount: data.logs.length + (_isLoadingMore ? 1 : 0),
        itemBuilder: (context, index) {
          if (index == data.logs.length) {
            return const Padding(
              padding: EdgeInsets.all(16.0),
              child: Center(child: CircularProgressIndicator()),
            );
          }

          final log = data.logs[index];
          return _buildHistoryCard(log, colorScheme, theme);
        },
      ),
    );
  }

  Widget _buildHistoryCard(ProductionHistoryModel log, ColorScheme colorScheme, ThemeData theme) {
    final date = log.timestamp.toLocal();
    final timeStr = DateFormat('MMM dd, hh:mm a').format(date);
    
    IconData icon;
    Color iconColor;
    
    switch (log.itemType.toLowerCase()) {
      case 'tub':
        icon = Icons.add_circle;
        iconColor = colorScheme.primary;
        break;
      case 'cap':
        icon = Icons.adjust;
        iconColor = Colors.orange;
        break;
      case 'inner':
        icon = Icons.radio_button_checked;
        iconColor = Colors.teal;
        break;
      case 'packing':
        icon = Icons.inventory;
        iconColor = colorScheme.secondary;
        break;
      case 'bundling':
        icon = Icons.layers;
        iconColor = colorScheme.tertiary;
        break;
      default:
        icon = Icons.history;
        iconColor = colorScheme.outline;
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: colorScheme.outlineVariant.withValues(alpha: 0.5)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: iconColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: iconColor),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    log.itemName,
                    style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${log.itemType.toUpperCase()}',
                    style: theme.textTheme.bodySmall?.copyWith(color: colorScheme.onSurfaceVariant),
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '${log.quantity.toInt()} units',
                  style: theme.textTheme.titleMedium?.copyWith(
                    color: colorScheme.primary,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  timeStr,
                  style: theme.textTheme.bodySmall?.copyWith(color: colorScheme.outline),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
