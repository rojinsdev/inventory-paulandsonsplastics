import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
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

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: requests.length,
            itemBuilder: (context, index) {
              final request = requests[index];
              return _RequestCard(request: request);
            },
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

class _RequestCard extends ConsumerWidget {
  final ProductionRequest request;

  const _RequestCard({required this.request});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final dateStr = DateFormat('MMM dd, HH:mm').format(request.createdAt);

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
              ),
              child: Row(
                children: [
                  Column(
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
                  const Spacer(),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text('Received', style: theme.textTheme.labelMedium),
                      const SizedBox(height: 4),
                      Text(dateStr, style: theme.textTheme.bodyMedium),
                    ],
                  ),
                ],
              ),
            ),
            if (request.status == 'pending' ||
                request.status == 'in-progress') ...[
              const SizedBox(height: 20),
              Row(
                children: [
                  if (request.status == 'pending')
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: () => ref
                            .read(productionRequestsProvider.notifier)
                            .updateStatus(request.id, 'in-progress'),
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
                        onPressed: () => ref
                            .read(productionRequestsProvider.notifier)
                            .updateStatus(request.id, 'completed'),
                        icon: const Icon(Icons.check_circle_outline),
                        label: const Text('Complete'),
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
      case 'in-progress':
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
