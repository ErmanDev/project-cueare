import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:drift_postgres/drift_postgres.dart';
import 'package:postgres/postgres.dart' as pg;

import '../config.dart';
import 'tables.dart';
import 'timestamp.dart';

part 'database.g.dart';

@DriftDatabase(
  tables: [Users, Students, Events, SessionWindows, AttendanceLogs],
)
class AppDatabase extends _$AppDatabase {
  /// Production: PostgreSQL (Laragon / local Postgres / Docker).
  AppDatabase({DatabaseConfig? config})
    : super(_openPostgres(config ?? AppConfig.instance.database));

  /// In-memory SQLite for unit tests (no Postgres required).
  AppDatabase.inMemory() : super(NativeDatabase.memory());

  /// Wrap an arbitrary executor (used by tests).
  AppDatabase.withExecutor(super.executor);

  static QueryExecutor _openPostgres(DatabaseConfig config) {
    return PgDatabase(
      endpoint: pg.Endpoint(
        host: config.host,
        port: config.port,
        database: config.name,
        username: config.user,
        password: config.password,
      ),
      settings: pg.ConnectionSettings(
        // Local LAN / Laragon — no TLS. Use SslMode.verifyFull for remote DBs.
        sslMode: pg.SslMode.disable,
        onOpen: (conn) async {
          // App tables live in schema `ssc` (not `public`).
          await conn.execute('CREATE SCHEMA IF NOT EXISTS ssc');
          await conn.execute('SET search_path TO ssc');
        },
      ),
    );
  }

  @override
  int get schemaVersion => 2;

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (m) async {
      await m.createAll();
      await _createAttendanceIndex();
    },
    onUpgrade: (m, from, to) async {
      if (from < 2) {
        // Rebuild so datetime columns become real timestamps (+ updated_at).
        await customStatement('DROP SCHEMA IF EXISTS ssc CASCADE');
        await customStatement('CREATE SCHEMA ssc');
        await customStatement('SET search_path TO ssc');
        await m.createAll();
        await _createAttendanceIndex();
      }
    },
    beforeOpen: (details) async {
      // SQLite only — Postgres enforces FKs by default.
      if (executor.dialect == SqlDialect.sqlite) {
        await customStatement('PRAGMA foreign_keys = ON');
      }
    },
  );

  Future<void> _createAttendanceIndex() {
    return customStatement(
      'CREATE INDEX IF NOT EXISTS idx_attendance_lookup '
      'ON attendance_logs (event_id, student_id, session_window_id, status)',
    );
  }
}
