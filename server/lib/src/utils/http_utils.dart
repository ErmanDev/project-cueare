import 'dart:convert';

import 'package:dart_frog/dart_frog.dart';

/// Thrown by services/handlers to short-circuit with a JSON error response.
class ApiException implements Exception {
  const ApiException(this.statusCode, this.message, {this.details});

  final int statusCode;
  final String message;
  final Map<String, dynamic>? details;

  Response toResponse() => Response.json(
    statusCode: statusCode,
    body: {
      'error': message,
      if (details != null) ...details!,
    },
  );

  @override
  String toString() => 'ApiException($statusCode): $message';
}

ApiException badRequest(String message, {Map<String, dynamic>? details}) =>
    ApiException(400, message, details: details);
ApiException notFound(String message) => ApiException(404, message);
ApiException conflict(String message, {Map<String, dynamic>? details}) =>
    ApiException(409, message, details: details);

/// Parses the request body as a JSON object; 400 on failure.
Future<Map<String, dynamic>> readJsonBody(RequestContext context) async {
  final raw = await context.request.body();
  if (raw.trim().isEmpty) return <String, dynamic>{};
  try {
    final decoded = jsonDecode(raw);
    if (decoded is Map<String, dynamic>) return decoded;
    throw badRequest('Request body must be a JSON object');
  } on FormatException {
    throw badRequest('Request body is not valid JSON');
  }
}

/// Convenience wrapper: runs [body], converting [ApiException] into a response
/// and anything else into a 500 with the message.
Future<Response> guard(Future<Response> Function() body) async {
  try {
    return await body();
  } on ApiException catch (e) {
    return e.toResponse();
  } catch (e, st) {
    // ignore: avoid_print
    print('Unhandled error: $e\n$st');
    return Response.json(
      statusCode: 500,
      body: {'error': 'Internal server error', 'detail': e.toString()},
    );
  }
}

Response methodNotAllowed() => Response.json(
  statusCode: 405,
  body: {'error': 'Method not allowed'},
);

/// Extracts a required string field from a JSON body.
String requireString(Map<String, dynamic> body, String key) {
  final v = body[key];
  if (v is! String || v.trim().isEmpty) {
    throw badRequest('Field "$key" is required');
  }
  return v.trim();
}

String? optionalString(Map<String, dynamic> body, String key) {
  final v = body[key];
  if (v == null) return null;
  if (v is! String) throw badRequest('Field "$key" must be a string');
  final t = v.trim();
  return t.isEmpty ? null : t;
}

int requireInt(Map<String, dynamic> body, String key) {
  final v = optionalInt(body, key);
  if (v == null) throw badRequest('Field "$key" is required');
  return v;
}

int? optionalInt(Map<String, dynamic> body, String key) {
  final v = body[key];
  if (v == null) return null;
  if (v is int) return v;
  if (v is String) {
    final parsed = int.tryParse(v);
    if (parsed != null) return parsed;
  }
  if (v is num) return v.toInt();
  throw badRequest('Field "$key" must be an integer');
}

bool? optionalBool(Map<String, dynamic> body, String key) {
  final v = body[key];
  if (v == null) return null;
  if (v is bool) return v;
  if (v is String) {
    if (v == 'true' || v == '1') return true;
    if (v == 'false' || v == '0') return false;
  }
  if (v is num) return v != 0;
  throw badRequest('Field "$key" must be a boolean');
}

int parsePathId(String raw) {
  final id = int.tryParse(raw);
  if (id == null) throw badRequest('Invalid id "$raw"');
  return id;
}

int? queryInt(RequestContext context, String key) {
  final v = context.request.uri.queryParameters[key];
  if (v == null || v.isEmpty) return null;
  final parsed = int.tryParse(v);
  if (parsed == null) throw badRequest('Query "$key" must be an integer');
  return parsed;
}

String? queryString(RequestContext context, String key) {
  final v = context.request.uri.queryParameters[key];
  if (v == null || v.trim().isEmpty) return null;
  return v.trim();
}

DateTime? queryDate(RequestContext context, String key) {
  final v = queryString(context, key);
  if (v == null) return null;
  final parsed = DateTime.tryParse(v);
  if (parsed == null) throw badRequest('Query "$key" must be an ISO date');
  return parsed;
}

DateTime parseDate(Map<String, dynamic> body, String key) {
  final raw = requireString(body, key);
  final parsed = DateTime.tryParse(raw);
  if (parsed == null) throw badRequest('Field "$key" must be an ISO-8601 date');
  return parsed;
}
