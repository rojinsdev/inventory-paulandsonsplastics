import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../features/auth/providers/auth_provider.dart';
import '../../features/auth/screens/login_screen.dart';
import '../../features/production/screens/dashboard_screen.dart';
import '../../features/inventory/screens/inventory_hub_screen.dart';
import '../../features/settings/screens/more_screen.dart';
import '../../features/production/screens/production_entry_screen.dart';
import '../../features/production/screens/production_type_selection_screen.dart';
import '../../features/production/screens/cap_production_entry_screen.dart';
import '../../features/inventory/screens/packing_screen.dart';

import '../../features/inventory/screens/bundling_screen.dart';
import '../../features/inventory/screens/raw_materials_screen.dart';
import '../../features/inventory/screens/stock_detail_screen.dart';
import '../../features/production/screens/production_requests_screen.dart';
import '../../features/production/screens/order_preparation_screen.dart';
import '../../core/navigation/main_navigation.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authStateProvider);

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/login',
    redirect: (context, state) {
      final isLoggedIn = authState.asData?.value != null;
      final isLoggingIn = state.uri.path == '/login';

      if (!isLoggedIn) {
        return isLoggingIn ? null : '/login';
      }

      if (isLoggingIn) {
        return '/';
      }

      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      // Stateful Shell Route for Persistent Bottom Navigation
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return MainNavigation(navigationShell: navigationShell);
        },
        branches: [
          // Branch 0: Dashboard/Home
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/',
                builder: (context, state) => const DashboardScreen(),
              ),
            ],
          ),
          // Branch 1: Inventory
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/inventory',
                builder: (context, state) => const InventoryHubScreen(),
              ),
            ],
          ),
          // Branch 2: More/Settings
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/settings',
                builder: (context, state) => const MoreScreen(),
              ),
            ],
          ),
        ],
      ),
      // Full screen routes (pushed on top of nav)
      GoRoute(
        parentNavigatorKey: _rootNavigatorKey,
        path: '/production/entry',
        builder: (context, state) => const ProductionTypeSelectionScreen(),
      ),
      GoRoute(
        parentNavigatorKey: _rootNavigatorKey,
        path: '/production/submit',
        builder: (context, state) => const ProductionEntryScreen(),
      ),
      GoRoute(
        parentNavigatorKey: _rootNavigatorKey,
        path: '/production/cap-submit',
        builder: (context, state) => const CapProductionEntryScreen(),
      ),
      GoRoute(
        parentNavigatorKey: _rootNavigatorKey,
        path: '/inventory/pack',
        builder: (context, state) => const PackingScreen(),
      ),
      GoRoute(
        parentNavigatorKey: _rootNavigatorKey,
        path: '/inventory/bundle',
        builder: (context, state) => const BundlingScreen(),
      ),
      GoRoute(
        parentNavigatorKey: _rootNavigatorKey,
        path: '/inventory/raw-materials',
        builder: (context, state) => const RawMaterialsScreen(),
      ),
      GoRoute(
        parentNavigatorKey: _rootNavigatorKey,
        path: '/stock-details',
        builder: (context, state) => const StockDetailScreen(),
      ),
      GoRoute(
        parentNavigatorKey: _rootNavigatorKey,
        path: '/stock-detail',
        builder: (context, state) => const StockDetailScreen(),
      ),
      GoRoute(
        parentNavigatorKey: _rootNavigatorKey,
        path: '/production/requests',
        builder: (context, state) => const ProductionRequestsScreen(),
      ),
      GoRoute(
        parentNavigatorKey: _rootNavigatorKey,
        path: '/production/preparation',
        builder: (context, state) => const OrderPreparationScreen(),
      ),
    ],
  );
});
