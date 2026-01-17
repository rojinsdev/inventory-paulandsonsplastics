import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../auth/providers/auth_provider.dart';
import '../providers/theme_provider.dart';

class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  void _showThemeBottomSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      builder: (context) {
        return Consumer(
          builder: (context, ref, _) {
            final selectedMode = ref.watch(themeModeProvider);
            final theme = Theme.of(context);
            final colorScheme = theme.colorScheme;

            return Padding(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Appearance',
                    style: theme.textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Choose how the app looks',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 24),

                  // Light Mode Option
                  _ThemeOptionTile(
                    icon: Icons.light_mode_rounded,
                    title: 'Light',
                    subtitle: 'Always use light theme',
                    isSelected: selectedMode == ThemeMode.light,
                    onTap: () {
                      ref
                          .read(themeModeProvider.notifier)
                          .setThemeMode(ThemeMode.light);
                      Navigator.pop(context);
                    },
                  ),
                  const SizedBox(height: 12),

                  // Dark Mode Option
                  _ThemeOptionTile(
                    icon: Icons.dark_mode_rounded,
                    title: 'Dark',
                    subtitle: 'Always use dark theme',
                    isSelected: selectedMode == ThemeMode.dark,
                    onTap: () {
                      ref
                          .read(themeModeProvider.notifier)
                          .setThemeMode(ThemeMode.dark);
                      Navigator.pop(context);
                    },
                  ),
                  const SizedBox(height: 12),

                  // System Mode Option
                  _ThemeOptionTile(
                    icon: Icons.settings_suggest_rounded,
                    title: 'System',
                    subtitle: 'Follow device settings',
                    isSelected: selectedMode == ThemeMode.system,
                    onTap: () {
                      ref
                          .read(themeModeProvider.notifier)
                          .setThemeMode(ThemeMode.system);
                      Navigator.pop(context);
                    },
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authStateProvider);
    final user = authState.value;
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final themeMode = ref.watch(themeModeProvider);

    // Get subtitle for appearance tile
    String themeSubtitle;
    switch (themeMode) {
      case ThemeMode.light:
        themeSubtitle = 'Light theme';
        break;
      case ThemeMode.dark:
        themeSubtitle = 'Dark theme';
        break;
      case ThemeMode.system:
        themeSubtitle = 'System default';
        break;
    }

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          // Expressive Large Header
          SliverAppBar.large(
            title: Text(
              'Settings',
              style: theme.textTheme.headlineLarge?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            centerTitle: false,
          ),

          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Profile Card
                  Container(
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      color: colorScheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(28),
                    ),
                    child: Row(
                      children: [
                        CircleAvatar(
                          radius: 36,
                          backgroundColor: colorScheme.primary,
                          child: Text(
                            (user?.fullName.isNotEmpty == true)
                                ? user!.fullName[0].toUpperCase()
                                : 'U',
                            style: theme.textTheme.headlineMedium?.copyWith(
                              color: colorScheme.onPrimary,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                        const SizedBox(width: 20),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                user?.fullName ?? 'Guest User',
                                style: theme.textTheme.titleLarge?.copyWith(
                                  fontWeight: FontWeight.bold,
                                  color: colorScheme.onSurface,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                user?.email ?? 'No email',
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  color: colorScheme.onSurfaceVariant,
                                ),
                              ),
                              const SizedBox(height: 12),
                              Chip(
                                label: Text(
                                  user?.role.toUpperCase() ?? 'STAFF',
                                  style: TextStyle(
                                    color: colorScheme.onSecondaryContainer,
                                    fontWeight: FontWeight.bold,
                                    fontSize: 12,
                                  ),
                                ),
                                backgroundColor: colorScheme.secondaryContainer,
                                padding: EdgeInsets.zero,
                                materialTapTargetSize:
                                    MaterialTapTargetSize.shrinkWrap,
                                shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(8)),
                                side: BorderSide.none,
                              )
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 40),

                  // Preferences
                  Text(
                    'General',
                    style: theme.textTheme.titleMedium?.copyWith(
                      color: colorScheme.primary,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 16),

                  _ExpressiveTile(
                    icon: Icons.notifications_outlined,
                    title: 'Notifications',
                    subtitle: 'Alerts and sounds',
                    onTap: () {},
                  ),
                  const SizedBox(height: 12),
                  _ExpressiveTile(
                    icon: Icons.dark_mode_outlined,
                    title: 'Appearance',
                    subtitle: themeSubtitle,
                    onTap: () => _showThemeBottomSheet(context, ref),
                  ),

                  const SizedBox(height: 40),

                  Text(
                    'Support',
                    style: theme.textTheme.titleMedium?.copyWith(
                      color: colorScheme.primary,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 16),

                  _ExpressiveTile(
                    icon: Icons.help_outline,
                    title: 'Help Center',
                    subtitle: 'FAQ and contact',
                    onTap: () {},
                  ),
                  const SizedBox(height: 12),
                  _ExpressiveTile(
                    icon: Icons.info_outline,
                    title: 'About',
                    subtitle: 'Version 1.0.0',
                    onTap: () {},
                  ),

                  const SizedBox(height: 48),

                  // Logout Button
                  FilledButton.icon(
                    onPressed: () {
                      ref.read(authStateProvider.notifier).logout();
                      context.go('/login');
                    },
                    style: FilledButton.styleFrom(
                      backgroundColor: colorScheme.errorContainer,
                      foregroundColor: colorScheme.onErrorContainer,
                      minimumSize: const Size(double.infinity, 56),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(28),
                      ),
                    ),
                    icon: const Icon(Icons.logout_rounded),
                    label: const Text('Log Out'),
                  ),
                  const SizedBox(height: 48),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ThemeOptionTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final bool isSelected;
  final VoidCallback onTap;

  const _ThemeOptionTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Material(
      color: isSelected ? colorScheme.primaryContainer : Colors.transparent,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            border: Border.all(
              color:
                  isSelected ? colorScheme.primary : colorScheme.outlineVariant,
              width: isSelected ? 2 : 1,
            ),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(
            children: [
              Icon(
                icon,
                color: isSelected
                    ? colorScheme.onPrimaryContainer
                    : colorScheme.onSurfaceVariant,
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: isSelected
                            ? colorScheme.onPrimaryContainer
                            : colorScheme.onSurface,
                      ),
                    ),
                    Text(
                      subtitle,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: isSelected
                            ? colorScheme.onPrimaryContainer
                                .withValues(alpha: 0.8)
                            : colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              if (isSelected)
                Icon(Icons.check_circle_rounded, color: colorScheme.primary),
            ],
          ),
        ),
      ),
    );
  }
}

class _ExpressiveTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _ExpressiveTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(24),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            border: Border.all(
                color: colorScheme.outlineVariant.withValues(alpha: 0.5)),
            borderRadius: BorderRadius.circular(24),
          ),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: colorScheme.surfaceContainerHigh,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Icon(icon, color: colorScheme.onSurfaceVariant),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: colorScheme.onSurface,
                      ),
                    ),
                    Text(
                      subtitle,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: colorScheme.outline),
            ],
          ),
        ),
      ),
    );
  }
}
