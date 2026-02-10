import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../constants/api_constants.dart';

class ApiClient {
  final Dio _dio;
  final SharedPreferences _storage;

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
          return handler.next(options);
        },
        onError: (DioException e, handler) async {
          if (e.response?.statusCode == 401) {
            debugPrint('⚠️ 401 Unauthorized: Attempting to refresh token...');

            final refreshToken = _storage.getString('refresh_token');
            if (refreshToken == null) {
              return handler.next(e); // No refresh token, fail
            }

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

                  // Retry the original request
                  final options = e.requestOptions;
                  options.headers['Authorization'] = 'Bearer $newAccessToken';

                  final cloneReq = await _dio.fetch(options);
                  return handler.resolve(cloneReq);
                }
              }
            } catch (refreshError) {
              debugPrint('❌ Token refresh failed: $refreshError');
              // Optionally clear storage here, or let UI handle the 401
              await _storage.remove('access_token');
              await _storage.remove('refresh_token');
              await _storage.remove('user_data');
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

    // Simple parsing to avoid circular dependency with User model if possible,
    // or import dart:convert
    try {
      // Create a localized import or just regex if we want to avoid import issues,
      // but simpler to just parse json.
      // We need to import dart:convert at the top if not present.
      // Looking at the file, it doesn't have dart:convert.
      // I'll add the import first in a separate replacement or just use regex for simplicity
      // as adding import changes line numbers at top.
      // Actually, let's just use string manipulation or a dynamic map if we can't import easily.
      // Wait, I can just use basic pattern matching since it's a JSON string.
      // "factory_id":"..."

      final match = RegExp(r'"factory_id":"([^"]+)"').firstMatch(userJson);
      return match?.group(1);
    } catch (e) {
      debugPrint('Error parsing factory_id: $e');
      return null;
    }
  }
}
