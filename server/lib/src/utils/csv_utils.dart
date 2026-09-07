/// Minimal RFC-4180-ish CSV parsing/encoding (handles quoted fields, commas,
/// escaped quotes and CRLF). Enough for student imports/attendance exports
/// without pulling in another dependency.
class CsvUtils {
  static List<List<String>> parse(String input) {
    final rows = <List<String>>[];
    var row = <String>[];
    final field = StringBuffer();
    var inQuotes = false;
    var i = 0;

    while (i < input.length) {
      final c = input[i];
      if (inQuotes) {
        if (c == '"') {
          if (i + 1 < input.length && input[i + 1] == '"') {
            field.write('"');
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field.write(c);
        }
      } else {
        if (c == '"') {
          inQuotes = true;
        } else if (c == ',') {
          row.add(field.toString());
          field.clear();
        } else if (c == '\r') {
          // ignore, handled by \n
        } else if (c == '\n') {
          row.add(field.toString());
          field.clear();
          rows.add(row);
          row = <String>[];
        } else {
          field.write(c);
        }
      }
      i++;
    }
    if (field.isNotEmpty || row.isNotEmpty) {
      row.add(field.toString());
      rows.add(row);
    }
    // Drop fully blank rows.
    return rows.where((r) => r.any((cell) => cell.trim().isNotEmpty)).toList();
  }

  static String encode(List<List<Object?>> rows) {
    final sb = StringBuffer();
    for (final row in rows) {
      sb.writeln(row.map(_escape).join(','));
    }
    return sb.toString();
  }

  static String _escape(Object? value) {
    final s = value?.toString() ?? '';
    if (s.contains(',') || s.contains('"') || s.contains('\n')) {
      return '"${s.replaceAll('"', '""')}"';
    }
    return s;
  }
}
