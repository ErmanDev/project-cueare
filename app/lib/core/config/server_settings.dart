import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_endpoints.dart';

/// Where the LAN server lives, e.g. `192.168.1.10:8080`.
class ServerSettings {
  const ServerSettings({
    required this.host,
    required this.port,
    this.https = false,
  });

  final String host;
  final int port;
  final bool https;

  String get baseUrl {
    final scheme = https ? 'https' : 'http';
    if ((!https && port == 80) || (https && port == 443)) {
      return '$scheme://$host';
    }
    return '$scheme://$host:$port';
  }

  String get display => '$host:$port';

  static ServerSettings fromUri(Uri uri) {
    final https = uri.scheme == 'https';
    final port = uri.hasPort ? uri.port : (https ? 443 : 80);
    return ServerSettings(host: uri.host, port: port, https: https);
  }

  /// Browser origin when the Flutter web app is served by the API.
  static ServerSettings? get sameOrigin {
    if (!kIsWeb) return null;
    final uri = Uri.base;
    if (uri.host.isEmpty) return null;
    return fromUri(uri);
  }

  Future<bool> get isReachable async {
    try {
      final dio = Dio(
        BaseOptions(
          baseUrl: baseUrl,
          connectTimeout: const Duration(seconds: 2),
          receiveTimeout: const Duration(seconds: 2),
          validateStatus: (_) => true,
        ),
      );
      final res = await dio.get<Map<String, dynamic>>(ApiEndpoints.health);
      return res.statusCode == 200 && res.data?['status'] == 'ok';
    } catch (_) {
      return false;
    }
  }

  /// Parses "192.168.1.10:8080", "192.168.1.10" (defaults to 8080) or a full
  /// "http://host:port" URL. Returns null if it can't be understood.
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
    var port = https ? 443 : 8080;
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

    if (kIsWeb) {
      final origin = ServerSettings.sameOrigin;
      if (origin != null && await origin.isReachable) return origin;
      const local = ServerSettings(host: 'localhost', port: 8080);
      if (await local.isReachable) return local;
    }
    return null;
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
