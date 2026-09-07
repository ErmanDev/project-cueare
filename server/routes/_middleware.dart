import 'package:dart_frog/dart_frog.dart';
import 'package:server/server.dart';

// One database + service instance for the whole process.
AppDatabase? _db;
AttendanceService? _service;

AppDatabase _database() =>
    _db ??= AppDatabase(config: AppConfig.instance.database);

AttendanceService _attendance() => _service ??= AttendanceService(
  _database(),
  qrHmacSecret: AppConfig.instance.qrHmacSecret,
);

Handler middleware(Handler handler) {
  return handler
      .use(requestLogger())
      .use(_cors())
      .use(provider<AppDatabase>((_) => _database()))
      .use(provider<AttendanceService>((_) => _attendance()));
}

/// Permissive CORS so a Flutter web build (or curl from a browser) on the same
/// LAN can talk to the API. Mobile builds don't need it but it's harmless.
Middleware _cors() {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Origin, Content-Type, Authorization',
  };
  return (handler) {
    return (context) async {
      if (context.request.method == HttpMethod.options) {
        return Response(statusCode: 204, headers: headers);
      }
      final response = await handler(context);
      return response.copyWith(headers: {...response.headers, ...headers});
    };
  };
}
