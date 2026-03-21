import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../auth/providers/auth_provider.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authStateProvider);
    final user = authState.value;
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () async {
          // Add refresh logic if needed for other providers
        },
        child: CustomScrollView(
          slivers: [
            // Large Collapsing App Bar
            SliverAppBar.large(
              title: Text(
                'Inventory Hub',
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
                      user?.fullName ?? 'User',
                      style: theme.textTheme.titleMedium?.copyWith(
                        color: colorScheme.primary,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    if (user?.factoryName != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        'Factory: ${user!.factoryName}',
                        style: theme.textTheme.labelMedium?.copyWith(
                          color: colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                    const SizedBox(height: 24),

                    // Date, Time and Shift Info
                    const _ShiftStatusCard(),

                    const SizedBox(height: 32),

                    Text(
                      'Entry Tasks',
                      style: theme.textTheme.titleLarge?.copyWith(
                        color: colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Expressive Cards Grid
                    _ExpressiveCard(
                      title: 'New Production',
                      subtitle: 'Log machine output',
                      icon: Icons.add_circle_outline,
                      containerColor: colorScheme.primaryContainer,
                      onTap: () => context.push('/production/entry'),
                    ),
                    const SizedBox(height: 16),

                    _ExpressiveCard(
                      title: 'Packing Entry',
                      subtitle: 'Create packets',
                      icon: Icons.inventory_2_outlined,
                      containerColor: colorScheme.secondaryContainer,
                      onTap: () => context.push('/inventory/pack'),
                    ),
                    const SizedBox(height: 16),

                    _ExpressiveCard(
                      title: 'Bundling Entry',
                      subtitle: 'Create bundles',
                      icon: Icons.layers_outlined,
                      containerColor: colorScheme.tertiaryContainer,
                      onTap: () => context.push('/inventory/bundle'),
                    ),

                    // Extra bottom spacing for FAB and Navigation Bar
                    const SizedBox(height: 120),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/production/entry'),
        icon: const Icon(Icons.add),
        label: const Text('Add Output'),
      ),
    );
  }
}

// Moved stock summary widgets to shared widgets folder

class _ExpressiveCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final IconData icon;
  final Color containerColor;
  final VoidCallback onTap;
  const _ExpressiveCard({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.containerColor,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    // Determine content color based on container color
    Color onContainerColor;
    if (containerColor == colorScheme.primaryContainer) {
      onContainerColor = colorScheme.onPrimaryContainer;
    } else if (containerColor == colorScheme.secondaryContainer) {
      onContainerColor = colorScheme.onSecondaryContainer;
    } else {
      onContainerColor = colorScheme.onTertiaryContainer;
    }

    return Container(
      height: 110, // Slightly taller for expressive feel
      decoration: BoxDecoration(
        color: containerColor,
        borderRadius: BorderRadius.circular(32), // Android 16 Expressive
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(32),
          child: Padding(
            padding: const EdgeInsets.all(20.0),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        title,
                        style: theme.textTheme.titleLarge?.copyWith(
                          color: onContainerColor,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        subtitle,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: onContainerColor.withValues(alpha: 0.8),
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(icon, size: 32, color: onContainerColor),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ShiftStatusCard extends StatelessWidget {
  const _ShiftStatusCard();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return StreamBuilder<DateTime>(
      stream: Stream.periodic(const Duration(seconds: 1), (_) => DateTime.now()),
      initialData: DateTime.now(),
      builder: (context, snapshot) {
        final now = snapshot.data!;
        final dateStr = DateFormat('EEEE, d MMMM yyyy').format(now);
        final timeStr = DateFormat('HH:mm:ss').format(now);
        
        final hour = now.hour;
        int shiftNumber;
        String shiftTimeRange;
        
        // Shift 1: 08:00 to 19:59 (8 AM to 7:59 PM)
        // Shift 2: 20:00 to 07:59 (8 PM to 7:59 AM)
        if (hour >= 8 && hour < 20) {
          shiftNumber = 1;
          shiftTimeRange = '08:00 - 20:00';
        } else {
          shiftNumber = 2;
          shiftTimeRange = '20:00 - 08:00';
        }

        return Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: colorScheme.surfaceContainerLow,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(
              color: colorScheme.outlineVariant.withValues(alpha: 0.1),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        dateStr,
                        style: theme.textTheme.labelLarge?.copyWith(
                          color: colorScheme.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        timeStr,
                        style: theme.textTheme.headlineMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: colorScheme.onSurface,
                          letterSpacing: -1,
                        ),
                      ),
                    ],
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: colorScheme.primary.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Column(
                      children: [
                        Text(
                          'SHIFT $shiftNumber',
                          style: theme.textTheme.labelLarge?.copyWith(
                            color: colorScheme.primary,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          shiftTimeRange,
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: colorScheme.primary.withValues(alpha: 0.6),
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}
