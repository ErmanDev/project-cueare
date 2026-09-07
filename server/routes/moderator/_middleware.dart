import 'package:dart_frog/dart_frog.dart';
import 'package:server/server.dart';

/// Everything under /moderator requires a moderator token.
Handler middleware(Handler handler) {
  return handler.use(authMiddleware(allowedRoles: {Roles.moderator}));
}
