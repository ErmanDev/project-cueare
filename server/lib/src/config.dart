import 'dart:convert';
import 'dart:io';
import 'dart:math';

/// Server-wide configuration.
///
/// Resolved from environment variables with local-dev defaults:
///
/// * `DATABASE_URL`      — `postgres://user:pass@host:5432/dbname`
///                         (preferred; overrides the discrete vars below)
/// * `DATABASE_HOST`     — default `localhost`
/// * `DATABASE_PORT`     — default `5432`
/// * `DATABASE_NAME`     — default `aclc` (tables live in schema `ssc`)
/// * `DATABASE_USER`     — default `postgres`
/// * `DATABASE_PASSWORD` — default `postgres` (Laragon / local installs)
/// * `JWT_SECRET`        — signing secret. If unset, generated once into
///                         `jwt_secret.txt` in the server working directory.
/// * `JWT_TTL_HOURS`     — token lifetime (default 12)
/// * `QR_HMAC_SECRET`    — optional. If set, student QR payloads are signed.
class AppConfig {
  AppConfig._({
    required this.database,
    required this.jwtSecret,
    required this.jwtTtl,
    required this.qrHmacSecret,
  });

  final DatabaseConfig database;
  final String jwtSecret;
  final Duration jwtTtl;
  final String? qrHmacSecret;

  static AppConfig? _instance;

  static AppConfig get instance => _instance ??= AppConfig.load();

  /// Test hook — inject a config without touching the filesystem.
  static void override(AppConfig config) => _instance = config;

  factory AppConfig.forTest({
    String jwtSecret = 'test-secret',
    String? qrHmacSecret,
  }) => AppConfig._(
    database: DatabaseConfig.localDefaults(),
    jwtSecret: jwtSecret,
    jwtTtl: const Duration(hours: 12),
    qrHmacSecret: qrHmacSecret,
  );

  factory AppConfig.load() {
    final env = <String, String>{
      ..._loadDotEnv(),
      ...Platform.environment, // process env wins over .env
    };
    final ttlHours = int.tryParse(env['JWT_TTL_HOURS'] ?? '') ?? 12;
    final qrSecret = env['QR_HMAC_SECRET'];

    return AppConfig._(
      database: DatabaseConfig.fromEnvironment(env),
      jwtSecret: env['JWT_SECRET'] ?? _loadOrCreateSecret(),
      jwtTtl: Duration(hours: ttlHours),
      qrHmacSecret: (qrSecret == null || qrSecret.isEmpty) ? null : qrSecret,
    );
  }

  /// Minimal `.env` reader (KEY=VALUE lines). Missing file is fine.
  static Map<String, String> _loadDotEnv() {
    final file = File('.env');
    if (!file.existsSync()) return const {};
    final out = <String, String>{};
    for (final raw in file.readAsLinesSync()) {
      final line = raw.trim();
      if (line.isEmpty || line.startsWith('#')) continue;
      final eq = line.indexOf('=');
      if (eq <= 0) continue;
      final key = line.substring(0, eq).trim();
      var value = line.substring(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.substring(1, value.length - 1);
      }
      out[key] = value;
    }
    return out;
  }

  static String _loadOrCreateSecret() {
    final file = File('jwt_secret.txt');
    if (file.existsSync()) {
      final existing = file.readAsStringSync().trim();
      if (existing.isNotEmpty) return existing;
    }
    final rng = Random.secure();
    final bytes = List<int>.generate(48, (_) => rng.nextInt(256));
    final secret = base64UrlEncode(bytes);
    file.writeAsStringSync(secret);
    stderr.writeln('[config] Generated new JWT secret at ${file.absolute.path}');
    return secret;
  }
}

/// PostgreSQL connection settings.
class DatabaseConfig {
  const DatabaseConfig({
    required this.host,
    required this.port,
    required this.name,
    required this.user,
    required this.password,
  });

  final String host;
  final int port;
  final String name;
  final String user;
  final String password;

  factory DatabaseConfig.localDefaults() => const DatabaseConfig(
    host: 'localhost',
    port: 5432,
    name: 'aclc',
    user: 'postgres',
    password: 'postgres',
  );

  factory DatabaseConfig.fromEnvironment(Map<String, String> env) {
    final url = env['DATABASE_URL'];
    if (url != null && url.trim().isNotEmpty) {
      return DatabaseConfig.fromUrl(url.trim());
    }

    final defaults = DatabaseConfig.localDefaults();
    final host = env['DATABASE_HOST']?.trim();
    final name = env['DATABASE_NAME']?.trim();
    final user = env['DATABASE_USER']?.trim();
    return DatabaseConfig(
      host: (host == null || host.isEmpty) ? defaults.host : host,
      port: int.tryParse(env['DATABASE_PORT'] ?? '') ?? defaults.port,
      name: (name == null || name.isEmpty) ? defaults.name : name,
      user: (user == null || user.isEmpty) ? defaults.user : user,
      password: env.containsKey('DATABASE_PASSWORD')
          ? env['DATABASE_PASSWORD']!
          : defaults.password,
    );
  }

  /// Parses `postgres://user:pass@host:5432/dbname` (also accepts `postgresql://`).
  factory DatabaseConfig.fromUrl(String url) {
    final uri = Uri.parse(url);
    if (uri.scheme != 'postgres' && uri.scheme != 'postgresql') {
      throw FormatException(
        'DATABASE_URL must start with postgres:// or postgresql://, got: $url',
      );
    }
    final userInfo = uri.userInfo;
    var user = 'postgres';
    var password = '';
    if (userInfo.isNotEmpty) {
      final parts = userInfo.split(':');
      user = Uri.decodeComponent(parts[0]);
      password = parts.length > 1
          ? Uri.decodeComponent(parts.sublist(1).join(':'))
          : '';
    }
    final dbName = uri.pathSegments.isNotEmpty
        ? uri.pathSegments.first
        : 'aclc';
    return DatabaseConfig(
      host: uri.host.isEmpty ? 'localhost' : uri.host,
      port: uri.hasPort ? uri.port : 5432,
      name: dbName,
      user: user,
      password: password,
    );
  }

  String get display => '$user@$host:$port/$name';

  /// Handy for DBeaver / pgAdmin / HeidiSQL connection forms.
  Map<String, Object> get connectionHints => {
    'host': host,
    'port': port,
    'database': name,
    'user': user,
  };
}
