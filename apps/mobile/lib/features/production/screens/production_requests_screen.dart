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
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (!isGuideDismissed)
                _FlowGuide(
                  onDismiss: () =>
                      ref.read(_guideDismissedProvider.notifier).state = true,
                ),
              if (requests.isEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 100),
                  child: Center(
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
                  ),
                )
              else
                ...requests.map((request) => _RequestCard(request: request)),
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
        color: colorScheme.primaryContainer.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: colorScheme.primaryContainer),
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
                    Icon(Icons.auto_awesome, color: colorScheme.primary),
                    const SizedBox(width: 12),
                    Text(
                      'Production Guide',
                      style: theme.textTheme.titleMedium?.copyWith(
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
                  description:
                      'Requests are automatically created from Sales Orders when stock is low.',
                ),
                const _GuideStep(
                  icon: Icons.play_circle_outline,
                  title: 'Start Work',
                  description:
                      'Tap "Start Work" to signal you have begun production on this request.',
                ),
                const _GuideStep(
                  icon: Icons.inventory_2_outlined,
                  title: 'Produce Items',
                  description:
                      'Log your session in "Simple Production" to increase stock first.',
                ),
                const _GuideStep(
                  icon: Icons.check_circle_outline,
                  title: 'Complete',
                  description:
                      'Tap "Complete" to fulfill the backorder and notify the sales admin.',
                  isLast: true,
                ),
              ],
            ),
          ),
          Positioned(
            top: 12,
            right: 12,
            child: IconButton(
              icon: const Icon(Icons.close, size: 20),
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
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: colorScheme.surface,
                shape: BoxShape.circle,
                border: Border.all(color: colorScheme.primaryContainer),
              ),
              child: Icon(icon, size: 16, color: colorScheme.primary),
            ),
            if (!isLast)
              Container(
                width: 2,
                height: 24,
                color: colorScheme.primaryContainer,
              ),
          ],
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: theme.textTheme.labelLarge?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
              Text(
                description,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: colorScheme.onSurfaceVariant,
                ),
              ),
              if (!isLast) const SizedBox(height: 12),
            ],
          ),
        ),
      ],
    );
  }
}

class _RequestCard extends ConsumerWidget {
  final ProductionRequest request;

  const _RequestCard({required this.request});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(24),
        side: BorderSide(color: colorScheme.outlineVariant),
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    request.productName,
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                      letterSpacing: -0.5,
                    ),
                  ),
                ),
                _StatusChip(status: request.status),
              ],
            ),
            if (request.productSize != null ||
                request.productColor != null) ...[
              const SizedBox(height: 4),
              Text(
                '${request.productSize ?? ''} ${request.productColor ?? ''}'
                    .trim(),
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: colorScheme.onSurfaceVariant,
                ),
              ),
            ],
            const SizedBox(height: 20),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color:
                    colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: request.isSatisfiable
                      ? Colors.transparent
                      : Colors.orange.withValues(alpha: 0.5),
                ),
              ),
              child: IntrinsicHeight(
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Target Quantity',
                              style: theme.textTheme.labelMedium),
                          const SizedBox(height: 4),
                          Text(
                            '${request.quantity} ${request.unitType.toUpperCase()}',
                            style: theme.textTheme.headlineSmall?.copyWith(
                              color: colorScheme.primary,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                    VerticalDivider(
                      color: colorScheme.outlineVariant,
                      thickness: 1,
                      indent: 4,
                      endIndent: 4,
                    ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text('Available Stock',
                              style: theme.textTheme.labelMedium),
                          const SizedBox(height: 4),
                          Text(
                            '${request.availableStock} ${request.unitType.toUpperCase()}',
                            style: theme.textTheme.titleLarge?.copyWith(
                              color: request.isSatisfiable
                                  ? Colors.green.shade700
                                  : Colors.red.shade700,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          if (!request.isSatisfiable)
                            Text(
                              'Insufficient',
                              style: theme.textTheme.labelSmall?.copyWith(
                                color: Colors.red.shade700,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (!request.isSatisfiable && request.status != 'completed') ...[
              const SizedBox(height: 12),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.orange.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    Icon(Icons.info_outline,
                        size: 16, color: Colors.orange.shade900),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Produce items first to increase available stock.',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: Colors.orange.shade900,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: () => context.push('/production/submit'),
                      style: TextButton.styleFrom(
                        visualDensity: VisualDensity.compact,
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                      ),
                      child: const Text('Log Entry'),
                    ),
                  ],
                ),
              ),
            ],
            if (request.status == 'pending' ||
                request.status == 'in_production') ...[
              const SizedBox(height: 20),
              Row(
                children: [
                  if (request.status == 'pending')
                    Expanded(
                      child: FilledButton.icon(
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
                        icon: const Icon(Icons.play_arrow_rounded),
                        label: const Text('Start Work'),
                        style: FilledButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12)),
                        ),
                      ),
                    )
                  else
                    Expanded(
                      child: FilledButton.tonalIcon(
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
                                          content: Text(
                                              'Request completed successfully')),
                                    );
                                  }
                                } catch (e) {
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(
                                        content: Text('$e'),
                                        backgroundColor:
                                            theme.colorScheme.error,
                                      ),
                                    );
                                  }
                                }
                              },
                        icon: Icon(request.isSatisfiable
                            ? Icons.check_circle_outline
                            : Icons.lock_outline),
                        label: Text(request.isSatisfiable
                            ? 'Complete'
                            : 'Stock Locked'),
                        style: FilledButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 12),
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
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(
        status.toUpperCase(),
        style: TextStyle(
          color: color,
          fontSize: 11,
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
