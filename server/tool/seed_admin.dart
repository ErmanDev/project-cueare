import 'dart:io';

import 'package:drift/drift.dart';
import 'package:server/server.dart';

/// Seeds (or resets) the superadmin account.
///
///   dart run tool/seed_admin.dart                 # admin / changeme123
///   dart run tool/seed_admin.dart myuser mypass   # custom credentials
///
/// Requires PostgreSQL to be running and database `aclc` to exist
/// (schema `ssc` is created automatically on connect).
///
/// If the username already exists its password is reset — handy if you've
/// locked yourself out.
Future<void> main(List<String> args) async {
  final username = args.isNotEmpty ? args[0] : 'admin';
  final password = args.length > 1 ? args[1] : 'changeme123';

  final config = AppConfig.instance;
  stdout.writeln('Connecting to PostgreSQL: ${config.database.display}');

  final db = AppDatabase(config: config.database);
  try {
    final existing = await (db.select(
      db.users,
    )..where((u) => u.username.equals(username))).getSingleOrNull();

    if (existing == null) {
      await db
          .into(db.users)
          .insert(
            UsersCompanion.insert(
              name: 'Super Admin',
              username: username,
              passwordHash: PasswordHasher.hash(password),
              role: Roles.superadmin,
            ),
          );
      stdout.writeln(
        'Superadmin created: username=$username password=$password',
      );
    } else {
      await (db.update(db.users)..where((u) => u.id.equals(existing.id))).write(
        UsersCompanion(
          passwordHash: Value(PasswordHasher.hash(password)),
          role: const Value(Roles.superadmin),
          updatedAt: Value(pgNow()),
        ),
      );
      stdout.writeln(
        'Superadmin "$username" already existed — password reset to: $password',
      );
    }
  } finally {
    await db.close();
  }
}
