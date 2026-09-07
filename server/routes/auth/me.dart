import 'package:dart_frog/dart_frog.dart';
import 'package:server/server.dart';

/// GET /auth/me — validates the stored token on app start and returns the
/// current user (any role).
Future<Response> onRequest(RequestContext context) async {
  if (context.request.method != HttpMethod.get) return methodNotAllowed();

  final handler = authMiddleware(allowedRoles: Roles.all)((ctx) async {
    final auth = ctx.read<AuthUser>();
    final db = ctx.read<AppDatabase>();
    final user = await (db.select(
      db.users,
    )..where((u) => u.id.equals(auth.id))).getSingleOrNull();
    if (user == null) {
      return Response.json(
        statusCode: 401,
        body: {'error': 'User no longer exists'},
      );
    }
    return Response.json(body: {'user': user.toApi(), 'role': user.role});
  });
  return handler(context);
}
