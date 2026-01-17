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
          connectTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 10),
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
        onError: (DioException e, handler) {
          // Log connection errors for debugging
          if (e.type == DioExceptionType.connectionTimeout ||
              e.type == DioExceptionType.receiveTimeout ||
              e.type == DioExceptionType.connectionError) {
            debugPrint('API Connection Error: ${e.message}');
            debugPrint('Base URL: ${ApiConstants.baseUrl}');
            debugPrint('Error Type: ${e.type}');
          }
          // TODO: Handle 401 Unauthorized (Logout)
          return handler.next(e);
        },
      ),
    );
  }

  Dio get client => _dio;
}
