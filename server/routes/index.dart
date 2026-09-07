import 'package:dart_frog/dart_frog.dart';
import 'package:server/server.dart';

/// Reachability check — open http://<server-ip>:8080/ in a phone browser.
Response onRequest(RequestContext context) {
  final db = AppConfig.instance.database;
  return Response.json(
    body: {
      'name': 'SSC QR Attendance API',
      'status': 'ok',
      'server_time': DateTime.now().toIso8601String(),
      'database': db.display,
    },
  );
}
