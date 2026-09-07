import 'package:dart_frog/dart_frog.dart';
import 'package:drift/drift.dart';
import 'package:server/server.dart';

/// GET  /admin/moderators          — list moderator accounts
/// POST /admin/moderators          — {name, username, password}
Future<Response> onRequest(RequestContext context) {
  return guard(() async {
    final db = context.read<AppDatabase>();
    switch (context.request.method) {
      case HttpMethod.get:
        final rows =
            await (db.select(db.users)
                  ..where((u) => u.role.equals(Roles.moderator))
                  ..orderBy([(u) => OrderingTerm.asc(u.name)]))
                .get();
        return Response.json(body: rows.map((u) => u.toApi()).toList());

      case HttpMethod.post:
        final body = await readJsonBody(context);
        final name = requireString(body, 'name');
        final username = requireString(body, 'username');
        final password = requireString(body, 'password');
        if (password.length < 4) {
          throw badRequest('Password must be at least 4 characters');
        }
        final exists =
            await (db.select(db.users)..where(
                  (u) => u.username.lower().equals(username.toLowerCase()),
                ))
                .getSingleOrNull();
        if (exists != null) throw conflict('Username already taken');

        final id = await db
            .into(db.users)
            .insert(
              UsersCompanion.insert(
                name: name,
                username: username,
                passwordHash: PasswordHasher.hash(password),
                role: Roles.moderator,
              ),
            );
        final created = await (db.select(
          db.users,
        )..where((u) => u.id.equals(id))).getSingle();
        return Response.json(statusCode: 201, body: created.toApi());

      default:
        return methodNotAllowed();
    }
  });
}
