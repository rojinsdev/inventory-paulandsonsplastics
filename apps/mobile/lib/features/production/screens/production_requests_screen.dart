import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/production_request_provider.dart';
import '../../auth/providers/auth_provider.dart';
import '../data/models/production_request_model.dart';

final _guideDismissedProvider = StateProvider<bool>((ref) => false);

class ProductionRequestsScreen extends ConsumerWidget {
  const ProductionRequestsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authStateProvider);
    final user = authState.value;
    final requestsAsync = ref.watch(productionRequestsProvider);
    final isGuideDismissed = ref.watch(_guideDismissedProvider);
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Production Requests'),
        actions: [
          IconButton(
            icon: const Icon(Icons.info_outline),
            onPressed: () =>
                ref.read(_guideDismissedProvider.notifier).state = false,
          ),
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
          final groupedRequests = <String, List<ProductionRequest>>{};
          final standaloneRequests = <ProductionRequest>[];

          for (final request in requests) {
            if (request.salesOrderId != null) {
              final groupId = request.orderNumber ?? request.salesOrderId!;
              groupedRequests.putIfAbsent(groupId, () => []).add(request);
            } else {
              standaloneRequests.add(request);
            }
          }

          if (requests.isEmpty) {
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

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (!isGuideDismissed)
                _FlowGuide(
                  onDismiss: () =>
                      ref.read(_guideDismissedProvider.notifier).state = true,
                ),
              for (final entry in groupedRequests.entries)
                _OrderProductionCard(
                  orderNumber: entry.key,
                  requests: entry.value,
                ),
              if (standaloneRequests.isNotEmpty)
                _OrderProductionCard(
                  orderNumber: 'Individual Requests',
                  requests: standaloneRequests,
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
  final String orderNumber;
  final List<ProductionRequest> requests;

  const _OrderProductionCard({
    required this.orderNumber,
    required this.requests,
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
                    orderNumber == 'Individual Requests'
                        ? orderNumber
                        : 'Order #${orderNumber.contains('-') ? orderNumber.split('-').last.toUpperCase() : orderNumber}',
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
                  ],
                ),
              ),
              _StatusChip(status: request.status),
            ],
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: colorScheme.surfaceContainerHighest.withOpacity(0.3),
              borderRadius: BorderRadius.circular(12),
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
                    'Produce items first to increase stock.',
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
          if (request.status == 'pending' || request.status == 'in_production') ...[
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: request.status == 'pending'
                  ? FilledButton.icon(
                      onPressed: () async {
                        try {
                          await ref
                              .read(productionRequestsProvider.notifier)
                              .updateStatus(request.id, 'in_production');
                        } catch (e) {
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text('Error: $e')),
                            );
                          }
                        }
                      },
                      icon: const Icon(Icons.play_arrow_rounded, size: 18),
                      label: const Text('Start Work'),
                      style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12)),
                      ),
                    )
                  : FilledButton.tonalIcon(
                      onPressed: !request.isSatisfiable
                          ? null
                          : () async {
                              try {
                                await ref
                                    .read(productionRequestsProvider.notifier)
                                    .updateStatus(request.id, 'completed');
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                        content: Text('Request completed')),
                                  );
                                }
                              } catch (e) {
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(content: Text('$e')),
                                  );
                                }
                              }
                            },
                      icon: Icon(
                          request.isSatisfiable
                              ? Icons.check_circle_outline
                              : Icons.lock_outline,
                          size: 18),
                      label: Text(
                          request.isSatisfiable ? 'Complete' : 'Stock Locked'),
                      style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12)),
                      ),
                    ),
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
        return Colors.green.shade700;
      case 'cancelled':
        return Colors.red.shade700;
      default:
        return Colors.grey.shade700;
    }
  }
}

class _FlowGuide extends StatelessWidget {
  final VoidCallback onDismiss;

  const _FlowGuide({required this.onDismiss});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Container(
      margin: const EdgeInsets.only(bottom: 24),
      decoration: BoxDecoration(
        color: colorScheme.primaryContainer.withOpacity(0.1),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: colorScheme.primaryContainer.withOpacity(0.5)),
      ),
      child: Stack(
        children: [
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.auto_awesome, color: colorScheme.primary, size: 20),
                    const SizedBox(width: 12),
                    Text(
                      'Production Guide',
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: colorScheme.primary,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                const _GuideStep(
                  icon: Icons.shopping_cart_outlined,
                  title: 'New Orders',
                  description: 'Requests are created when stock is low.',
                ),
                const _GuideStep(
                  icon: Icons.play_circle_outline,
                  title: 'Start Work',
                  description: 'Signal you have begun production.',
                ),
                const _GuideStep(
                  icon: Icons.inventory_2_outlined,
                  title: 'Log Entry',
                  description: 'Increase stock in "Simple Production".',
                ),
                const _GuideStep(
                  icon: Icons.check_circle_outline,
                  title: 'Complete',
                  description: 'Fulfill backorder and notify admin.',
                  isLast: true,
                ),
              ],
            ),
          ),
          Positioned(
            top: 8,
            right: 8,
            child: IconButton(
              icon: const Icon(Icons.close, size: 18),
              onPressed: onDismiss,
              visualDensity: VisualDensity.compact,
            ),
          ),
        ],
      ),
    );
  }
}

class _GuideStep extends StatelessWidget {
  final IconData icon;
  final String title;
  final String description;
  final bool isLast;

  const _GuideStep({
    required this.icon,
    required this.title,
    required this.description,
    this.isLast = false,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Column(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: colorScheme.surface,
                shape: BoxShape.circle,
                border: Border.all(color: colorScheme.primaryContainer),
              ),
              child: Icon(icon, size: 14, color: colorScheme.primary),
            ),
            if (!isLast)
              Container(
                width: 1.5,
                height: 20,
                color: colorScheme.primaryContainer.withOpacity(0.5),
              ),
          ],
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: theme.textTheme.labelMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
              Text(
                description,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: colorScheme.onSurfaceVariant,
                  fontSize: 10,
                ),
              ),
              if (!isLast) const SizedBox(height: 8),
            ],
          ),
        ),
      ],
    );
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
