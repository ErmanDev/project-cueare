import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_token.dart';
import '../config/server_settings.dart';

/// A user-presentable API error.
class ApiFailure implements Exception {
  const ApiFailure({
    required this.message,
    this.statusCode,
    this.code,
    this.data,
  });

  final String message;
  final int? statusCode;

  /// Machine-readable code from the server (e.g. NO_ACTIVE_WINDOW).
  final String? code;
  final Map<String, dynamic>? data;

  bool get isNetwork => statusCode == null;
  bool get isUnauthorized => statusCode == 401;

  @override
  String toString() => message;

  static ApiFailure from(Object error, {String? serverLabel}) {
    if (error is ApiFailure) return error;
    if (error is DioException) {
      final response = error.response;
      if (response != null) {
        final body = response.data;
        String? message;
        String? code;
        Map<String, dynamic>? data;
        if (body is Map<String, dynamic>) {
          data = body;
          message = body['error'] as String?;
          code = body['code'] as String?;
        }
        return ApiFailure(
          message: message ?? _defaultFor(response.statusCode),
          statusCode: response.statusCode,
          code: code,
          data: data,
        );
      }
      switch (error.type) {
        case DioExceptionType.connectionTimeout:
        case DioExceptionType.receiveTimeout:
        case DioExceptionType.sendTimeout:
          return ApiFailure(
            message:
                'Server timed out${serverLabel == null ? '' : ' ($serverLabel)'}. '
                'Check that the server is running and you are on the same Wi-Fi.',
          );
        case DioExceptionType.connectionError:
        case DioExceptionType.unknown:
          return ApiFailure(
            message:
                'Can\'t reach the server${serverLabel == null ? '' : ' at $serverLabel'}. '
                'Check Wi-Fi, the server, and Server Settings.',
          );
        default:
          return ApiFailure(message: error.message ?? 'Request failed');
      }
    }
    return ApiFailure(message: error.toString());
  }

  static String _defaultFor(int? status) => switch (status) {
    400 => 'Invalid request',
    401 => 'Please log in again',
    403 => 'You are not allowed to do that',
    404 => 'Not found',
    409 => 'Conflict',
    422 => 'Could not process request',
    _ => 'Server error (${status ?? '?'})',
  };
}

/// Thin Dio wrapper. All repositories go through this.
class ApiClient {
  ApiClient({
    required this.baseUrl,
    required String? Function() tokenGetter,
    required void Function() onUnauthorized,
  }) : _dio = Dio(
         BaseOptions(
           baseUrl: baseUrl,
           connectTimeout: const Duration(seconds: 6),
           receiveTimeout: const Duration(seconds: 15),
           sendTimeout: const Duration(seconds: 15),
           headers: {'Accept': 'application/json'},
           // Let us map every status ourselves in the interceptor below.
           validateStatus: (_) => true,
         ),
       ) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          final token = tokenGetter();
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onResponse: (response, handler) {
          final status = response.statusCode ?? 0;
          if (status >= 400) {
            if (status == 401 &&
                !response.requestOptions.path.endsWith('/auth/login')) {
              onUnauthorized();
            }
            handler.reject(
              DioException.badResponse(
                statusCode: status,
                requestOptions: response.requestOptions,
                response: response,
              ),
            );
            return;
          }
          handler.next(response);
        },
      ),
    );
  }

  final String baseUrl;
  final Dio _dio;

  String get serverLabel => baseUrl.replaceFirst('http://', '');

  Future<T> _run<T>(Future<Response<dynamic>> Function() call) async {
    try {
      final res = await call();
      return res.data as T;
    } catch (e) {
      throw ApiFailure.from(e, serverLabel: serverLabel);
    }
  }

  Future<Map<String, dynamic>> getJson(
    String path, {
    Map<String, dynamic>? query,
  }) =>
      _run<Map<String, dynamic>>(() => _dio.get(path, queryParameters: query));

  Future<List<dynamic>> getList(String path, {Map<String, dynamic>? query}) =>
      _run<List<dynamic>>(() => _dio.get(path, queryParameters: query));

  Future<String> getText(String path, {Map<String, dynamic>? query}) =>
      _run<String>(
        () => _dio.get(
          path,
          queryParameters: query,
          options: Options(responseType: ResponseType.plain),
        ),
      );

  Future<Map<String, dynamic>> postJson(
    String path,
    Map<String, dynamic> body, {
    Map<String, dynamic>? query,
  }) => _run<Map<String, dynamic>>(
    () => _dio.post(path, data: body, queryParameters: query),
  );

  Future<Map<String, dynamic>> putJson(
    String path,
    Map<String, dynamic> body,
  ) => _run<Map<String, dynamic>>(() => _dio.put(path, data: body));

  Future<void> delete(String path, {Map<String, dynamic>? query}) =>
      _run<dynamic>(() => _dio.delete(path, queryParameters: query));
}

/// The API client for the currently configured server. Rebuilds when the
/// server settings change. Throws if the server isn't configured yet — the
/// role gate guarantees screens using this are only shown after setup.
final apiClientProvider = Provider<ApiClient>((ref) {
  final settings = ref.watch(serverSettingsProvider).value;
  if (settings == null) {
    throw StateError('Server not configured');
  }
  return ApiClient(
    baseUrl: settings.baseUrl,
    tokenGetter: () => ref.read(authTokenProvider),
    onUnauthorized: () => ref.read(authTokenProvider.notifier).expire(),
  );
});
