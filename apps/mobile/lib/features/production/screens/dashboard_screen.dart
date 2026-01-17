import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../auth/providers/auth_provider.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  /// Returns time-sensitive greeting based on current hour
  String _getGreeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) {
      return 'Good Morning,';
    } else if (hour < 17) {
      return 'Good Afternoon,';
    } else {
      return 'Good Evening,';
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authStateProvider);
    final user = authState.value;
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          // Large Collapsing App Bar with Time-Sensitive Greeting
          SliverAppBar.large(
            title: Text(
              _getGreeting(),
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
                    style: theme.textTheme.displaySmall?.copyWith(
                      color: colorScheme.primary,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 32),

                  Text(
                    'Quick Actions',
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
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/production/entry'),
        icon: const Icon(Icons.add),
        label: const Text('Production'),
      ),
    );
  }
}

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
      height: 100,
      decoration: BoxDecoration(
        color: containerColor,
        borderRadius: BorderRadius.circular(28),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(28),
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
