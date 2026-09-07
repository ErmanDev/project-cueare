import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Where the LAN server lives, e.g. `192.168.1.10:8080`.
class ServerSettings {
  const ServerSettings({required this.host, required this.port});

  final String host;
  final int port;

  String get baseUrl => 'http://$host:$port';
  String get display => '$host:$port';

  /// Parses "192.168.1.10:8080", "192.168.1.10" (defaults to 8080) or a full
  /// "http://host:port" URL. Returns null if it can't be understood.
  static ServerSettings? parse(String raw) {
    var s = raw.trim();
    if (s.isEmpty) return null;
    s = s.replaceFirst(RegExp(r'^https?://', caseSensitive: false), '');
    s = s.replaceAll(RegExp(r'/+$'), '');
    final parts = s.split(':');
    if (parts.length > 2) return null;
    final host = parts[0].trim();
    if (host.isEmpty || host.contains('/') || host.contains(' ')) return null;
    var port = 8080;
    if (parts.length == 2) {
      final p = int.tryParse(parts[1].trim());
      if (p == null || p < 1 || p > 65535) return null;
      port = p;
    }
    return ServerSettings(host: host, port: port);
  }
}

/// Loads + persists [ServerSettings] with shared_preferences.
/// `null` state = not configured yet (first launch).
class ServerSettingsNotifier extends AsyncNotifier<ServerSettings?> {
  static const _hostKey = 'server_host';
  static const _portKey = 'server_port';

  @override
  Future<ServerSettings?> build() async {
    final prefs = await SharedPreferences.getInstance();
    final host = prefs.getString(_hostKey);
    final port = prefs.getInt(_portKey);
    if (host == null || host.isEmpty || port == null) return null;
    return ServerSettings(host: host, port: port);
  }

  Future<void> save(ServerSettings settings) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_hostKey, settings.host);
    await prefs.setInt(_portKey, settings.port);
    state = AsyncData(settings);
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_hostKey);
    await prefs.remove(_portKey);
    state = const AsyncData(null);
  }
}

final serverSettingsProvider =
    AsyncNotifierProvider<ServerSettingsNotifier, ServerSettings?>(
      ServerSettingsNotifier.new,
    );
