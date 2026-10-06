/// Candidate parse result containing extracted candidate student codes and names.
class CandidatePayloadParse {
  final List<String> codes;
  final List<String> names;

  const CandidatePayloadParse({required this.codes, required this.names});
}

/// Normalizes a code by lowercasing and stripping non-alphanumeric characters.
String normalizeCode(String input) =>
    input.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');

/// Sanitizes raw input by converting unicode hyphens/dashes, non-breaking spaces, and hidden whitespace to ASCII.
String sanitizeRawPayload(String raw) {
  return raw
      .replaceAll(RegExp(r'[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]'), '-')
      .replaceAll(RegExp(r'[\u00A0\u2000-\u200B\u202F\u205F\u3000]'), ' ')
      .trim();
}

/// Extracts candidate codes and names from a raw composite QR string.
CandidatePayloadParse extractCandidatePayloads(String raw) {
  final sanitized = sanitizeRawPayload(raw);
  if (sanitized.isEmpty) {
    return const CandidatePayloadParse(codes: [], names: []);
  }

  final codes = <String>[];
  final names = <String>[];

  // 1. Match formatted codes (e.g. 02-23-0125, STU-2026-0011, 02.23.0125)
  final matches = RegExp(r'\b([A-Za-z0-9]+(?:[-_/.]\s*[A-Za-z0-9]+)+)\b').allMatches(sanitized);
  for (final match in matches) {
    final candidate = match.group(1)!.replaceAll(RegExp(r'\s+'), '').replaceAll(RegExp(r'[/.]'), '-');
    if (candidate.length <= 64 && !codes.contains(candidate)) {
      codes.add(candidate);
    }
  }

  // 2. Tokenize by common delimiters
  final tokens = sanitized
      .split(RegExp(r'[,;|\t\n\r]+'))
      .map((t) => t.trim().replaceAll(RegExp(r'\s+'), ' '))
      .where((t) => t.isNotEmpty);

  for (final token in tokens) {
    final cleanToken = token.replaceAll(RegExp(r'[/.]'), '-');
    if (cleanToken.length <= 64 &&
        RegExp(r'^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$').hasMatch(cleanToken)) {
      if (!codes.contains(cleanToken)) codes.add(cleanToken);
    } else if (RegExp(r'[A-Za-z]').hasMatch(token) &&
        token.length >= 2 &&
        token.length <= 100) {
      if (!names.contains(token)) names.add(token);
    }
  }

  return CandidatePayloadParse(codes: codes, names: names);
}

/// Utility for extracting a primary student code from raw composite QR payloads.
String? extractStudentCodeFromRaw(String raw) {
  final parsed = extractCandidatePayloads(raw);
  if (parsed.codes.isNotEmpty) return parsed.codes.first;
  return null;
}
