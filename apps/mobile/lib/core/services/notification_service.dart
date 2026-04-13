import 'dart:io';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../api/api_client.dart';
import '../../features/auth/providers/auth_provider.dart';
import '../../features/production/providers/production_request_provider.dart';
import '../../features/production/providers/sales_order_provider.dart';
import '../constants/api_constants.dart';

final notificationServiceProvider = Provider((ref) {
  final apiClient = ref.watch(apiClientProvider);
  final sharedPrefs = ref.watch(sharedPreferencesProvider);
  return NotificationService(apiClient, sharedPrefs, ref);
});

class NotificationService {
  final ApiClient _apiClient;
  final SharedPreferences _sharedPrefs;
  final Ref _ref;
  final FlutterLocalNotificationsPlugin _localNotifications = FlutterLocalNotificationsPlugin();

  NotificationService(this._apiClient, this._sharedPrefs, this._ref);

  Future<void> initialize() async {
    debugPrint('🔔 [FCM] NotificationService: initialize() started');
    try {
      FirebaseMessaging messaging = FirebaseMessaging.instance;

      // 1. Initialize Local Notifications for Foreground Support
      const AndroidInitializationSettings initializationSettingsAndroid =
          AndroidInitializationSettings('@mipmap/ic_launcher');
      const DarwinInitializationSettings initializationSettingsIOS =
          DarwinInitializationSettings();
      const InitializationSettings initializationSettings = InitializationSettings(
        android: initializationSettingsAndroid,
        iOS: initializationSettingsIOS,
      );

      await _localNotifications.initialize(
        initializationSettings,
        onDidReceiveNotificationResponse: (details) {
          debugPrint('🔔 [Local] Notification clicked: ${details.payload}');
        },
      );

      // 2. Create Android High Importance Channel
      if (Platform.isAndroid) {
        const AndroidNotificationChannel channel = AndroidNotificationChannel(
          'high_importance_channel', // id
          'High Importance Notifications', // title
          description: 'This channel is used for important notifications.', // description
          importance: Importance.max,
        );

        await _localNotifications
            .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
            ?.createNotificationChannel(channel);
        debugPrint('🔔 [FCM] Android High Importance Channel created');
      }

      // Request permissions (iOS/Android 13+)
      debugPrint('🔔 [FCM] Requesting permissions...');
      NotificationSettings settings = await messaging.requestPermission(
        alert: true,
        announcement: false,
        badge: true,
        carPlay: false,
        criticalAlert: false,
        provisional: false,
        sound: true,
      );

      debugPrint('🔔 [FCM] Permission status: ${settings.authorizationStatus}');

      if (settings.authorizationStatus != AuthorizationStatus.denied) {
        debugPrint('🔔 [FCM] Permission granted or provisional');

        // Get token
        try {
          debugPrint('🔔 [FCM] Getting token...');
          String? token = await messaging.getToken();
          if (token != null) {
            debugPrint('🔔 [FCM] Token obtained: ${token.substring(0, 5)}...');
            await _registerToken(token);
          } else {
            debugPrint('⚠️ [FCM] Token is null');
          }
        } catch (e) {
          debugPrint('❌ [FCM] Error getting token: $e');
        }

        // Listen for token refresh
        FirebaseMessaging.instance.onTokenRefresh.listen((newToken) {
          debugPrint('🔔 [FCM] Token refreshed');
          _registerToken(newToken);
        });

        // Handle foreground messages
        FirebaseMessaging.onMessage.listen((RemoteMessage message) {
          debugPrint('🔔 [FCM] Foreground Message received: ${message.notification?.title}');
          _showLocalNotification(message);
          _refreshDemandLists();
        });

        // Handle notification clicks when app is in background but not terminated
        FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
          debugPrint('🔔 [FCM] Notification opened app: ${message.data}');
          _refreshDemandLists();
        });

        // Listen for auth state changes to register pending tokens
        _ref.listen(authStateProvider, (previous, next) {
          if (next.value != null && previous?.value == null) {
            debugPrint('🔔 [FCM] User logged in, checking for pending tokens...');
            registerPendingToken();
          }
        });
      } else {
        debugPrint('🔔 [FCM] Permission DENIED');
      }
    } catch (e, stack) {
      debugPrint('❌ [FCM] Critical Error in NotificationService.initialize(): $e');
      debugPrint('Stack: $stack');
    }
    debugPrint('🔔 [FCM] initialize() completed');
  }

  void _refreshDemandLists() {
    try {
      _ref.invalidate(productionRequestsProvider);
      _ref.invalidate(pendingOrdersProvider);
    } catch (e) {
      debugPrint('🔔 [FCM] refresh demand lists: $e');
    }
  }

  void _showLocalNotification(RemoteMessage message) {
    RemoteNotification? notification = message.notification;
    AndroidNotification? android = message.notification?.android;

    if (notification != null) {
      _localNotifications.show(
        notification.hashCode,
        notification.title,
        notification.body,
        NotificationDetails(
          android: AndroidNotificationDetails(
            'high_importance_channel',
            'High Importance Notifications',
            channelDescription: 'This channel is used for important notifications.',
            importance: Importance.max,
            priority: Priority.high,
            icon: android?.smallIcon ?? '@mipmap/ic_launcher',
          ),
          iOS: const DarwinNotificationDetails(
            presentAlert: true,
            presentBadge: true,
            presentSound: true,
          ),
        ),
        payload: message.data.toString(),
      );
    }
  }

  Future<void> _registerToken(String token) async {
    debugPrint('🔔 NotificationService: _registerToken called');
    try {
      final authState = _ref.read(authStateProvider);
      final user = authState.value;

      if (user == null) {
        debugPrint('🔔 Saving FCM token for later registration (user not logged in)');
        await _sharedPrefs.setString('pending_fcm_token', token);
        return;
      }

      final platform = Platform.isAndroid ? 'android' : 'ios';

      debugPrint('🔔 [FCM] Registering token with backend at ${ApiConstants.notificationsTokens}...');
      await _apiClient.client.post(
        ApiConstants.notificationsTokens,
        data: {
          'token': token,
          'platform': platform,
        },
      );

      await _sharedPrefs.remove('pending_fcm_token');
      debugPrint('✅ FCM Token registered successfully with backend');
    } catch (e) {
      debugPrint('❌ Error registering FCM token: $e');
    }
  }

  /// Call this when user logs in to register any pending token
  Future<void> registerPendingToken() async {
    debugPrint('🔔 NotificationService: registerPendingToken() called');
    final token = _sharedPrefs.getString('pending_fcm_token');
    if (token != null) {
      debugPrint('🔔 Registering pending FCM token...');
      await _registerToken(token);
    } else {
      debugPrint('🔔 No pending FCM token found');
    }
  }
}
