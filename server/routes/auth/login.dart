import 'package:dart_frog/dart_frog.dart';
import 'package:drift/drift.dart';
import 'package:server/server.dart';

/// POST /auth/login  {username, password} -> {token, role, user}
Future<Response> onRequest(RequestContext context) {
  if (context.request.method != HttpMethod.post) {
    return Future.value(methodNotAllowed());
  }
  return guard(() async {
    final body = await readJsonBody(context);
    final username = requireString(body, 'username');
    final password = requireString(body, 'password');

    final db = context.read<AppDatabase>();
    final user =
        await (db.select(db.users)
              ..where((u) => u.username.lower().equals(username.toLowerCase())))
            .getSingleOrNull();

    if (user == null || !PasswordHasher.verify(password, user.passwordHash)) {
      return Response.json(
        statusCode: 401,
        body: {'error': 'Invalid username or password'},
      );
    }

    final token = issueToken(
      userId: user.id,
      username: user.username,
      role: user.role,
    );
    return Response.json(
      body: {
        'token': token,
        'role': user.role,
        'user': user.toApi(),
        'expires_in_hours': AppConfig.instance.jwtTtl.inHours,
      },
    );
  });
}
