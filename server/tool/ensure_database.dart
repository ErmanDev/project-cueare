import 'dart:io';

import 'package:postgres/postgres.dart';
import 'package:server/server.dart';

/// Creates the target database (default `aclc`) if it does not exist yet.
///
/// Connects to the maintenance DB `postgres` with the same credentials,
/// then `CREATE DATABASE` when needed.
///
///   dart run tool/ensure_database.dart
///
/// Override connection via env:
///   DATABASE_URL=postgres://postgres:YOURPASS@localhost:5432/aclc
///   # or DATABASE_HOST / DATABASE_PORT / DATABASE_NAME / DATABASE_USER / DATABASE_PASSWORD
///
/// App tables are created in schema `ssc` on first AppDatabase open.
Future<void> main() async {
  final cfg = AppConfig.instance.database;
  stdout.writeln('Target database: ${cfg.display}');

  final conn = await Connection.open(
    Endpoint(
      host: cfg.host,
      port: cfg.port,
      database: 'postgres',
      username: cfg.user,
      password: cfg.password,
    ),
    settings: const ConnectionSettings(sslMode: SslMode.disable),
  );

  try {
    final rows = await conn.execute(
      Sql.named(
        'SELECT 1 FROM pg_database WHERE datname = @name',
      ),
      parameters: {'name': cfg.name},
    );

    if (rows.isNotEmpty) {
      stdout.writeln('Database "${cfg.name}" already exists.');
    } else {
      // CREATE DATABASE cannot run inside a prepared statement with params.
      final safeName = _quoteIdent(cfg.name);
      await conn.execute('CREATE DATABASE $safeName');
      stdout.writeln('Created database "${cfg.name}".');
    }
  } finally {
    await conn.close();
  }

  stdout.writeln('');
  stdout.writeln('Connect from DBeaver / pgAdmin / HeidiSQL / Laragon:');
  stdout.writeln('  Host:     ${cfg.host}');
  stdout.writeln('  Port:     ${cfg.port}');
  stdout.writeln('  Database: ${cfg.name}');
  stdout.writeln('  User:     ${cfg.user}');
  stdout.writeln('  Password: (your DATABASE_PASSWORD / postgres user password)');
  stdout.writeln('');
  stdout.writeln('Next: dart run tool/seed_admin.dart');
}

String _quoteIdent(String name) {
  if (!RegExp(r'^[a-zA-Z_][a-zA-Z0-9_]*$').hasMatch(name)) {
    throw ArgumentError(
      'DATABASE_NAME must be a simple identifier (letters/digits/_): $name',
    );
  }
  return '"$name"';
}
