import 'server_settings.dart';

/// Compile-time API host via `--dart-define=API_BASE_URL=...`.
///
/// ```
/// flutter run --dart-define=API_BASE_URL=http://192.168.1.7:8080
/// flutter build apk --release --dart-define=API_BASE_URL=http://192.168.1.7:8080
/// ```
abstract class AppConfig {
  const AppConfig._();

  static const String _definedApiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
  );

  /// Default server IP/host used in debug builds when no `--dart-define` is given.10.74.210.219:84';
  static const String _defaultApiBaseUrl = 'http://10.74.210.219:84';

  static String get apiBaseUrl =>
      _definedApiBaseUrl.isNotEmpty ? _definedApiBaseUrl : _defaultApiBaseUrl;

  static ServerSettings? get defaultServerSettings =>
      ServerSettings.parse(apiBaseUrl);
}
