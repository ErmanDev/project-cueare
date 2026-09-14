import 'dart:io' show Platform;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Where IIS publishes the attendance site, e.g. `attendance.yourschool.edu`.
class ServerSettings {
  const ServerSettings({
    required this.host,
    required this.port,
    this.https = false,
  });

  final String host;
  final int port;
  final bool https;

  bool get _defaultPort => (!https && port == 80) || (https && port == 443);

  String get baseUrl {
    final scheme = https ? 'https' : 'http';
    if (_defaultPort) return '$scheme://$host';
    return '$scheme://$host:$port';
  }

  String get display => _defaultPort ? host : '$host:$port';

  /// Express API on this machine (`PORT`, default 8080).
  /// Android emulator reaches the host loopback at 10.0.2.2.
  static ServerSettings localDev() {
    if (Platform.isAndroid) {
      return const ServerSettings(host: '10.0.2.2', port: 8080);
    }
    return const ServerSettings(host: '127.0.0.1', port: 8080);
  }

  /// Parses an IIS host name (`attendance.school.edu`), optional scheme,
  /// or `host:port`. HTTP defaults to port 80; HTTPS defaults to 443.
  static ServerSettings? parse(String raw) {
    var s = raw.trim();
    if (s.isEmpty) return null;
    var https = false;
    final lower = s.toLowerCase();
    if (lower.startsWith('https://')) {
      https = true;
      s = s.substring(8);
    } else if (lower.startsWith('http://')) {
      s = s.substring(7);
    }
    s = s.replaceAll(RegExp(r'/+$'), '');
    final parts = s.split(':');
    if (parts.length > 2) return null;
    final host = parts[0].trim();
    if (host.isEmpty || host.contains('/') || host.contains(' ')) return null;
    var port = https ? 443 : 80;
    if (parts.length == 2) {
      final p = int.tryParse(parts[1].trim());
      if (p == null || p < 1 || p > 65535) return null;
      port = p;
    }
    return ServerSettings(host: host, port: port, https: https);
  }
}

/// Loads + persists [ServerSettings] with shared_preferences.
/// `null` state = not configured yet (first launch).
class ServerSettingsNotifier extends AsyncNotifier<ServerSettings?> {
  static const _hostKey = 'server_host';
  static const _portKey = 'server_port';
  static const _httpsKey = 'server_https';

  @override
  Future<ServerSettings?> build() async {
    final prefs = await SharedPreferences.getInstance();
    final host = prefs.getString(_hostKey);
    final port = prefs.getInt(_portKey);
    if (host != null && host.isNotEmpty && port != null) {
      return ServerSettings(
        host: host,
        port: port,
        https: prefs.getBool(_httpsKey) ?? false,
      );
    }
    return ServerSettings.localDev();
  }

  Future<void> save(ServerSettings settings) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_hostKey, settings.host);
    await prefs.setInt(_portKey, settings.port);
    await prefs.setBool(_httpsKey, settings.https);
    state = AsyncData(settings);
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_hostKey);
    await prefs.remove(_portKey);
    await prefs.remove(_httpsKey);
    state = const AsyncData(null);
  }
}

final serverSettingsProvider =
    AsyncNotifierProvider<ServerSettingsNotifier, ServerSettings?>(
      ServerSettingsNotifier.new,
    );
