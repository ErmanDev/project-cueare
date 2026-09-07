import 'http_utils.dart';

/// Safe student QR / ID-code rules.
///
/// Drift already binds query parameters (so classic SQL injection cannot reach
/// the database engine), but we still reject hostile payloads early:
/// length limits, charset whitelist, and LIKE-wildcard escaping for search.
abstract final class StudentCode {
  /// Max length of a decoded student id (plain QR content / `sid` field).
  static const maxCodeLength = 64;

  /// Max length of the raw QR string before parsing (plain or signed JSON).
  static const maxPayloadLength = 512;

  /// Letters, digits, hyphen, underscore only — blocks quotes, `;`, `--`, etc.
  static final RegExp _pattern = RegExp(r'^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$');

  static bool isValid(String code) => _pattern.hasMatch(code);

  /// Validates and returns [code], or throws 400.
  static String requireValid(String code, {String field = 'student_id_code'}) {
    final trimmed = code.trim();
    if (trimmed.isEmpty) {
      throw badRequest('Field "$field" is required');
    }
    if (trimmed.length > maxCodeLength || !isValid(trimmed)) {
      throw badRequest(
        'Invalid $field — use letters, digits, hyphen or underscore '
        '(max $maxCodeLength characters)',
        details: {'code': 'INVALID_STUDENT_CODE'},
      );
    }
    return trimmed;
  }

  /// Rejects oversized / empty raw QR payloads before JSON parse.
  static void requirePayloadSize(String raw) {
    if (raw.trim().isEmpty) throw badRequest('Empty QR payload');
    if (raw.length > maxPayloadLength) {
      throw badRequest(
        'QR payload too large',
        details: {'code': 'QR_PAYLOAD_TOO_LARGE'},
      );
    }
  }

  /// Escapes `%`, `_`, and `\` so user search text cannot broaden a LIKE match.
  static String escapeLike(String input) => input
      .replaceAll(r'\', r'\\')
      .replaceAll('%', r'\%')
      .replaceAll('_', r'\_');
}
