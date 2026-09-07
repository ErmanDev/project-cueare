import 'package:drift/drift.dart';
import 'package:drift_postgres/drift_postgres.dart';

import 'timestamp.dart';

/// Login accounts: superadmin & moderator.
class Users extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get name => text()();
  TextColumn get username => text().unique()();
  TextColumn get passwordHash => text()();

  /// 'superadmin' | 'moderator' — validated in code.
  TextColumn get role => text()();
  Column<PgDateTime> get createdAt =>
      customType(pgTimestamp).clientDefault(pgNow)();
  Column<PgDateTime> get updatedAt =>
      customType(pgTimestamp).clientDefault(pgNow)();
}

/// QR-code holders (not login users).
class Students extends Table {
  IntColumn get id => integer().autoIncrement()();

  /// The value encoded in the QR (e.g. STU-2026-0143).
  TextColumn get studentIdCode => text().unique()();
  TextColumn get fullName => text()();
  TextColumn get section => text().nullable()();
  TextColumn get photoUrl => text().nullable()();
  Column<PgDateTime> get createdAt =>
      customType(pgTimestamp).clientDefault(pgNow)();
  Column<PgDateTime> get updatedAt =>
      customType(pgTimestamp).clientDefault(pgNow)();
}

/// One row per event being tracked.
class Events extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get name => text()();
  Column<PgDateTime> get eventDate => customType(pgTimestamp)();
  BoolColumn get isActive => boolean().withDefault(const Constant(true))();
  IntColumn get createdBy => integer().references(Users, #id)();
  Column<PgDateTime> get createdAt =>
      customType(pgTimestamp).clientDefault(pgNow)();
  Column<PgDateTime> get updatedAt =>
      customType(pgTimestamp).clientDefault(pgNow)();
}

/// Admin-defined, dynamic, per-event session windows
/// (e.g. Morning 07:00–12:00, Afternoon 13:00–17:00).
class SessionWindows extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get eventId =>
      integer().references(Events, #id, onDelete: KeyAction.cascade)();

  /// "Morning" / "Afternoon" — admin can rename/add more.
  TextColumn get sessionLabel => text()();

  /// Stored as "HH:mm"; compared as minutes since midnight.
  TextColumn get startTime => text()();
  TextColumn get endTime => text()();
  IntColumn get sortOrder => integer()();
}

/// The actual scan records.
class AttendanceLogs extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get eventId =>
      integer().references(Events, #id, onDelete: KeyAction.cascade)();
  IntColumn get studentId =>
      integer().references(Students, #id, onDelete: KeyAction.cascade)();
  IntColumn get sessionWindowId =>
      integer().references(SessionWindows, #id, onDelete: KeyAction.cascade)();

  /// 'IN' | 'OUT' — auto-computed server-side.
  TextColumn get direction => text()();
  Column<PgDateTime> get scannedAt =>
      customType(pgTimestamp).clientDefault(pgNow)();

  /// The moderator who scanned.
  IntColumn get scannedBy => integer().references(Users, #id)();

  /// 'confirmed' | 'cancelled'
  TextColumn get status => text()();
  TextColumn get deviceNote => text().nullable()();
  Column<PgDateTime> get updatedAt =>
      customType(pgTimestamp).clientDefault(pgNow)();
}
