/// Helpers for the "HH:mm" strings stored in `session_windows`.
class TimeUtils {
  static final _hhmm = RegExp(r'^([01]?\d|2[0-3]):([0-5]\d)$');

  /// Parses "HH:mm" into minutes since midnight, or `null` if invalid.
  static int? parseMinutes(String? value) {
    if (value == null) return null;
    final m = _hhmm.firstMatch(value.trim());
    if (m == null) return null;
    return int.parse(m.group(1)!) * 60 + int.parse(m.group(2)!);
  }

  static bool isValid(String? value) => parseMinutes(value) != null;

  /// Normalises e.g. "7:00" → "07:00".
  static String normalise(String value) {
    final minutes = parseMinutes(value)!;
    return format(minutes);
  }

  static String format(int minutes) {
    final h = (minutes ~/ 60).toString().padLeft(2, '0');
    final m = (minutes % 60).toString().padLeft(2, '0');
    return '$h:$m';
  }

  static int minutesOfDay(DateTime t) => t.hour * 60 + t.minute;

  /// True when [aStart,aEnd) and [bStart,bEnd) overlap (minutes).
  static bool overlaps(int aStart, int aEnd, int bStart, int bEnd) =>
      aStart < bEnd && bStart < aEnd;

  static DateTime startOfDay(DateTime t) => DateTime(t.year, t.month, t.day);

  static bool isSameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  /// True when [date]'s calendar day is strictly before [relativeTo]'s day.
  static bool isPastDate(DateTime date, {DateTime? relativeTo}) {
    final today = startOfDay(relativeTo ?? DateTime.now());
    return startOfDay(date).isBefore(today);
  }

  /// True when [date] is today or a future calendar day.
  static bool isTodayOrFuture(DateTime date, {DateTime? relativeTo}) =>
      !isPastDate(date, relativeTo: relativeTo);
}
