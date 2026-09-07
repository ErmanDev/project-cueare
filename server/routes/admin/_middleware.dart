import 'package:dart_frog/dart_frog.dart';
import 'package:server/server.dart';

/// Everything under /admin requires a superadmin token.
Handler middleware(Handler handler) {
  return handler.use(authMiddleware(allowedRoles: {Roles.superadmin}));
}
