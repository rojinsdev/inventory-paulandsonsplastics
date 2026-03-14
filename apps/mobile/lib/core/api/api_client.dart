import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../constants/api_constants.dart';

class ApiClient {
  final Dio _dio;
  final SharedPreferences _storage;
  final _sessionExpiredController = StreamController<void>.broadcast();
  Completer<void>? _refreshCompleter;

  Stream<void> get onSessionExpired => _sessionExpiredController.stream;

  ApiClient(this._storage)
      : _dio = Dio(
          BaseOptions(
            baseUrl: ApiConstants.baseUrl,
            connectTimeout: const Duration(seconds: 30),
            receiveTimeout: const Duration(seconds: 30),
            headers: {'Content-Type': 'application/json'},
          ),
        ) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = _storage.getString('access_token');
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          debugPrint('🌐 Request: ${options.method} ${options.uri}');
          return handler.next(options);
        },
        onResponse: (response, handler) {
          debugPrint(
              '✅ Response: ${response.statusCode} for ${response.requestOptions.uri}');
          return handler.next(response);
        },
        onError: (DioException e, handler) async {
          if (e.response?.statusCode == 401) {
            debugPrint('⚠️ 401 Unauthorized: Attempting to refresh token...');

            final refreshToken = _storage.getString('refresh_token');
            if (refreshToken == null) {
              _sessionExpiredController.add(null);
              return handler.next(e); // No refresh token, fail
            }

            // --- LOCKING MECHANISM START ---
            if (_refreshCompleter != null) {
              // A refresh is already in progress, wait for it
              debugPrint('⏳ Waiting for active token refresh...');
              await _refreshCompleter!.future;

              // After wait, retry with new token if available
              final newToken = _storage.getString('access_token');
              if (newToken != null) {
                final options = e.requestOptions;
                options.headers['Authorization'] = 'Bearer $newToken';
                try {
                  final cloneReq = await _dio.fetch(options);
                  return handler.resolve(cloneReq);
                } catch (retryError) {
                  return handler.next(e);
                }
              } else {
                // Refresh failed for the other request too
                return handler.next(e);
              }
            }

            // Start a new refresh
            _refreshCompleter = Completer<void>();
            // --- LOCKING MECHANISM END ---

            try {
              // Create a new Dio instance to avoid interceptor loops
              final refreshDio = Dio(BaseOptions(
                baseUrl: ApiConstants.baseUrl,
                headers: {'Content-Type': 'application/json'},
              ));

              final response = await refreshDio.post(
                '/api/auth/refresh',
                data: {'refresh_token': refreshToken},
              );

              if (response.statusCode == 200 && response.data != null) {
                final session = response.data['session'];
                final newAccessToken = session?['access_token'];
                final newRefreshToken = session?['refresh_token'];

                if (newAccessToken != null) {
                  // Save new tokens
                  await _storage.setString('access_token', newAccessToken);
                  if (newRefreshToken != null) {
                    await _storage.setString('refresh_token', newRefreshToken);
                  }

                  debugPrint('✅ Token refreshed successfully');
                  _refreshCompleter?.complete(); // Unlock
                  _refreshCompleter = null;

                  // Retry the original request
                  final options = e.requestOptions;
                  options.headers['Authorization'] = 'Bearer $newAccessToken';

                  final cloneReq = await _dio.fetch(options);
                  return handler.resolve(cloneReq);
                }
              }
            } catch (refreshError) {
              debugPrint('❌ Token refresh failed: $refreshError');
              // Clear storage logic moved to AuthProvider via stream
              // But we still clear here to be safe or rely on the listener
              await _storage.remove('access_token');
              await _storage.remove('refresh_token');
              await _storage.remove('user_data');

              _sessionExpiredController.add(null); // Notify app to logout
            } finally {
              // Ensure completer is completed even on error to release waiters
              if (_refreshCompleter != null &&
                  !_refreshCompleter!.isCompleted) {
                _refreshCompleter!.complete();
                _refreshCompleter = null;
              }
            }
          }

          // Log connection errors for debugging
          if (e.type == DioExceptionType.connectionTimeout ||
              e.type == DioExceptionType.receiveTimeout ||
              e.type == DioExceptionType.connectionError) {
            debugPrint('API Connection Error: ${e.message}');
            debugPrint('Base URL: ${ApiConstants.baseUrl}');
            debugPrint('Error Type: ${e.type}');
          }
          return handler.next(e);
        },
      ),
    );
  }

  Dio get client => _dio;

  Future<String?> getFactoryId() async {
    final userJson = _storage.getString('user_data');
    if (userJson == null) return null;

    try {
      final match = RegExp(r'"factory_id":"([^"]+)"').firstMatch(userJson);
      return match?.group(1);
    } catch (e) {
      debugPrint('Error parsing factory_id: $e');
      return null;
    }
  }

  void dispose() {
    _sessionExpiredController.close();
  }
}
