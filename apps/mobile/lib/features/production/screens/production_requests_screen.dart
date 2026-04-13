import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/production_request_provider.dart';
import '../../auth/providers/auth_provider.dart';
import '../data/models/production_request_model.dart';


class ProductionRequestsScreen extends ConsumerWidget {
  const ProductionRequestsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authStateProvider);
    final user = authState.value;
    final requestsAsync = ref.watch(productionRequestsProvider);
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Production Requests'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () =>
                ref.read(productionRequestsProvider.notifier).fetchRequests(
                      factoryId: user?.factoryId,
                    ),
          ),
        ],
      ),
      body: requestsAsync.when(
        data: (requests) {
          final filteredRequests =
              requests.where((r) => r.showsInRequestsList).toList();

          if (filteredRequests.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.assignment_turned_in_outlined,
                      size: 64, color: colorScheme.outline),
                  const SizedBox(height: 16),
                  Text('No pending requests',
                      style: theme.textTheme.titleMedium),
                  const SizedBox(height: 8),
                  Text('Factory is up to date!',
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: colorScheme.outline)),
                ],
              ),
            );
          }

          final groupedRequests = <String, List<ProductionRequest>>{};
          final standaloneRequests = <ProductionRequest>[];

          for (final request in filteredRequests) {
            if (request.salesOrderId != null) {
              groupedRequests.putIfAbsent(request.salesOrderId!, () => []).add(request);
            } else {
              standaloneRequests.add(request);
            }
          }

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              for (final entry in groupedRequests.entries)
                _OrderProductionCard(
                  orderSuffix: ProductionRequest.webOrderSuffixFromId(entry.key),
                  requests: entry.value,
                ),
              if (standaloneRequests.isNotEmpty)
                _OrderProductionCard(
                  orderSuffix: '',
                  requests: standaloneRequests,
                  titleOverride: 'Individual Requests',
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
              Text('Error loading requests',
                  style: theme.textTheme.titleMedium),
              Text(err.toString(), style: theme.textTheme.bodySmall),
            ],
          ),
        ),
      ),
    );
  }
}

class _OrderProductionCard extends StatelessWidget {
  final String orderSuffix;
  final List<ProductionRequest> requests;
  final String? titleOverride;

  const _OrderProductionCard({
    required this.orderSuffix,
    required this.requests,
    this.titleOverride,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Card(
      margin: const EdgeInsets.only(bottom: 24),
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
                Icon(Icons.assignment_outlined,
                    size: 20, color: colorScheme.primary),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    titleOverride ??
                        (orderSuffix.isEmpty
                            ? 'Order'
                            : 'Order #$orderSuffix'),
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: colorScheme.primary,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: requests.length,
            separatorBuilder: (context, index) =>
                const Divider(height: 1, indent: 20, endIndent: 20),
            itemBuilder: (context, index) =>
                _RequestRow(request: requests[index]),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

class _RequestRow extends ConsumerWidget {
  final ProductionRequest request;

  const _RequestRow({required this.request});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

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
                      request.productName,
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                        letterSpacing: -0.5,
                        color: request.isInner ? Colors.purple[700] : null,
                      ),
                    ),
                    if (request.productSize != null ||
                        request.productColor != null)
                      Text(
                        '${request.productSize ?? ''} ${request.productColor ?? ''}'
                            .trim(),
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: colorScheme.onSurfaceVariant,
                        ),
                      ),
                    if (request.includeInner &&
                        request.requiredInnerName != null) ...[
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.orange.withAlpha(25),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.orange.withAlpha(75)),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.layers_outlined, size: 12, color: Colors.orange.shade900),
                            const SizedBox(width: 6),
                            Text(
                              'WITH INNER: ${request.requiredInnerName}',
                              style: TextStyle(
                                color: Colors.orange.shade900, 
                                fontSize: 10, 
                                fontWeight: FontWeight.bold, 
                                letterSpacing: 0.5
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    if (!request.isInner &&
                        !request.includeInner &&
                        request.productId != null) ...[
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.blueGrey.withAlpha(28),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.blueGrey.withAlpha(90)),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.layers_clear_outlined,
                                size: 12, color: Colors.blueGrey.shade800),
                            const SizedBox(width: 6),
                            Text(
                              'WITHOUT INNER (customer)',
                              style: TextStyle(
                                color: Colors.blueGrey.shade900,
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                                letterSpacing: 0.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    if (request.capName != null && request.capName!.trim().isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.teal.withAlpha(28),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.teal.withAlpha(100)),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.circle_outlined, size: 12, color: Colors.teal.shade900),
                            const SizedBox(width: 6),
                            Text(
                              'CAP: ${request.capName}'
                                  '${request.capColor != null && request.capColor!.trim().isNotEmpty ? ' (${request.capColor})' : ''}',
                              style: TextStyle(
                                color: Colors.teal.shade900,
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                                letterSpacing: 0.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (request.isInner) ...[
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.purple.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.purple.withOpacity(0.3)),
                  ),
                  child: const Text('INNER', 
                    style: TextStyle(color: Colors.purple, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 0.5)),
                ),
                const SizedBox(width: 8),
              ],
              _StatusChip(status: request.status),
            ],
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: request.isInner 
                  ? Colors.purple.withOpacity(0.05) 
                  : colorScheme.surfaceContainerHighest.withOpacity(0.3),
              borderRadius: BorderRadius.circular(12),
              border: request.isInner 
                  ? Border.all(color: Colors.purple.withOpacity(0.2)) 
                  : null,
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Target', style: theme.textTheme.labelSmall),
                      Text(
                        '${request.quantity} ${request.unitType.toUpperCase()}',
                        style: theme.textTheme.titleMedium?.copyWith(
                          color: colorScheme.primary,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
                VerticalDivider(color: colorScheme.outlineVariant),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text('Stock', style: theme.textTheme.labelSmall),
                      Text(
                        '${request.availableStock} ${request.unitType.toUpperCase()}',
                        style: theme.textTheme.titleMedium?.copyWith(
                          color: request.isSatisfiable
                              ? Colors.green.shade700
                              : Colors.red.shade700,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          if (request.stockSummary != null && !request.isSatisfiable && request.status != 'completed') ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.blue.shade50.withOpacity(0.5),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.blue.shade100),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.hub_outlined, size: 14, color: Colors.blue.shade900),
                      const SizedBox(width: 8),
                      Text(
                        'Stock Breakdown (Current Factory)',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: Colors.blue.shade900,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  _StockDetailRow(
                    label: 'Loose Items',
                    value: request.stockSummary!.factorySpecific.loose,
                    unit: 'LOOSE',
                  ),
                  _StockDetailRow(
                    label: 'Packets',
                    value: request.stockSummary!.factorySpecific.packed,
                    unit: 'PACKET',
                  ),
                  _StockDetailRow(
                    label: 'Finished Bundles',
                    value: request.stockSummary!.factorySpecific.finished,
                    unit: 'BUNDLE',
                  ),
                ],
              ),
            ),
          ],
          if (!request.isSatisfiable && request.status != 'completed') ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Icon(Icons.info_outline, size: 14, color: Colors.orange.shade900),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Produce tubs first to increase stock.',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: Colors.orange.shade900,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: () => context.push('/production/submit'),
                  style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
                  child: const Text('Log Entry', style: TextStyle(fontSize: 12)),
                ),
              ],
            ),
          ],
          if (request.status != 'completed' && request.status != 'prepared' && request.status != 'cancelled') ...[
            const SizedBox(height: 16),
            Column(
              children: [
                if (!request.isSatisfiable) ...[
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.tonalIcon(
                      onPressed: () {
                        if (request.isInner) {
                          context.push('/production/inner-submit');
                        } else if (request.unitType == 'loose') {
                          context.push('/production/submit');
                        } else if (request.unitType == 'packet') {
                          context.push('/inventory/pack');
                        } else {
                          context.push('/inventory/bundle');
                        }
                      },
                      icon: Icon(
                        request.unitType == 'loose' 
                            ? Icons.factory_outlined 
                            : request.unitType == 'packet' 
                                ? Icons.inventory_2_outlined 
                                : Icons.layers_outlined, 
                        size: 18
                      ),
                      label: Text(
                        request.unitType == 'loose' 
                            ? 'Start Production' 
                            : request.unitType == 'packet' 
                                ? 'Go to Packing' 
                                : 'Go to Bundling'
                      ),
                      style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12)),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: request.isSatisfiable
                        ? () async {
                            try {
                              await ref
                                  .read(productionRequestsProvider.notifier)
                                  .updateStatus(request.id, 'prepared');
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(content: Text('Marked as prepared')),
                                );
                              }
                            } catch (e) {
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(content: Text('$e')),
                                );
                              }
                            }
                          }
                        : null,
                    icon: const Icon(Icons.check_circle_outline, size: 18),
                    label: const Text('Mark as Prepared'),
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      backgroundColor: request.isSatisfiable 
                          ? Colors.green.shade700 
                          : Colors.grey.shade200,
                      foregroundColor: request.isSatisfiable 
                          ? Colors.white 
                          : Colors.grey.shade500,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                ),
              ],
            ),

          ],
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String status;
  const _StatusChip({required this.status});

  @override
  Widget build(BuildContext context) {
    final color = _getStatusColor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Text(
        status.toUpperCase(),
        style: TextStyle(
          color: color,
          fontSize: 10,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.5,
        ),
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'pending':
        return Colors.orange.shade700;
      case 'in_production':
        return Colors.blue.shade700;
      case 'completed':
      case 'prepared':
        return Colors.green.shade700;
      case 'cancelled':
        return Colors.red.shade700;
      default:
        return Colors.grey.shade700;
    }
  }
}


class _StockDetailRow extends StatelessWidget {
  final String label;
  final int value;
  final String unit;

  const _StockDetailRow({
    required this.label,
    required this.value,
    required this.unit,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: theme.textTheme.labelSmall?.copyWith(
              color: colorScheme.onSurfaceVariant,
            ),
          ),
          Text(
            '$value $unit',
            style: theme.textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.bold,
              color: value > 0 ? colorScheme.primary : colorScheme.error,
            ),
          ),
        ],
      ),
    );
  }
}
