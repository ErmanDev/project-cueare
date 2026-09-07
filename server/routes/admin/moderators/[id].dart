import 'package:dart_frog/dart_frog.dart';
import 'package:drift/drift.dart';
import 'package:server/server.dart';

/// PUT    /admin/moderators/:id   — {name?, username?, password?}
/// DELETE /admin/moderators/:id
Future<Response> onRequest(RequestContext context, String rawId) {
  return guard(() async {
    final id = parsePathId(rawId);
    final db = context.read<AppDatabase>();
    final existing =
        await (db.select(db.users)
              ..where((u) => u.id.equals(id))
              ..where((u) => u.role.equals(Roles.moderator)))
            .getSingleOrNull();
    if (existing == null) throw notFound('Moderator not found');

    switch (context.request.method) {
      case HttpMethod.get:
        return Response.json(body: existing.toApi());

      case HttpMethod.put:
        final body = await readJsonBody(context);
        final name = optionalString(body, 'name');
        final username = optionalString(body, 'username');
        final password = optionalString(body, 'password');

        if (username != null && username != existing.username) {
          final taken =
              await (db.select(db.users)
                    ..where(
                      (u) => u.username.lower().equals(username.toLowerCase()),
                    )
                    ..where((u) => u.id.equals(id).not()))
                  .getSingleOrNull();
          if (taken != null) throw conflict('Username already taken');
        }
        if (password != null && password.length < 4) {
          throw badRequest('Password must be at least 4 characters');
        }

        await (db.update(db.users)..where((u) => u.id.equals(id))).write(
          UsersCompanion(
            name: name == null ? const Value.absent() : Value(name),
            username: username == null ? const Value.absent() : Value(username),
            passwordHash: password == null
                ? const Value.absent()
                : Value(PasswordHasher.hash(password)),
            updatedAt: Value(pgNow()),
          ),
        );
        final updated = await (db.select(
          db.users,
        )..where((u) => u.id.equals(id))).getSingle();
        return Response.json(body: updated.toApi());

      case HttpMethod.delete:
        // Keep attendance history intact: refuse deletion if they've scanned.
        final scans =
            await (db.selectOnly(db.attendanceLogs)
                  ..addColumns([db.attendanceLogs.id.count()])
                  ..where(db.attendanceLogs.scannedBy.equals(id)))
                .map((row) => row.read(db.attendanceLogs.id.count()) ?? 0)
                .getSingle();
        if (scans > 0) {
          throw conflict(
            'This moderator has $scans attendance scans on record and cannot '
            'be deleted. Change their password to revoke access instead.',
          );
        }
        await (db.delete(db.users)..where((u) => u.id.equals(id))).go();
        return Response(statusCode: 204);

      default:
        return methodNotAllowed();
    }
  });
}
