import 'package:intl/intl.dart';

abstract class Fmt {
  static final _date = DateFormat('MMM d, yyyy');
  static final _dateShort = DateFormat('MMM d');
  static final _time = DateFormat('h:mm a');
  static final _dateTime = DateFormat('MMM d, h:mm a');
  static final _weekday = DateFormat('EEEE, MMM d, yyyy');

  static String date(DateTime d) => _date.format(d);
  static String dateShort(DateTime d) => _dateShort.format(d);
  static String time(DateTime d) => _time.format(d);
  static String dateTime(DateTime d) => _dateTime.format(d);
  static String weekday(DateTime d) => _weekday.format(d);

  /// "HH:mm" → "7:00 AM"
  static String hhmm(String hhmm) {
    final parts = hhmm.split(':');
    if (parts.length != 2) return hhmm;
    final h = int.tryParse(parts[0]);
    final m = int.tryParse(parts[1]);
    if (h == null || m == null) return hhmm;
    return _time.format(DateTime(2000, 1, 1, h, m));
  }

  static String hhmmRange(String start, String end) =>
      '${hhmm(start)} – ${hhmm(end)}';

  /// `1` → `1st Year`
  static String yearLevel(int? level) {
    if (level == null) return '—';
    final teens = level % 100;
    final suffix = teens >= 11 && teens <= 13
        ? 'th'
        : switch (level % 10) {
            1 => 'st',
            2 => 'nd',
            3 => 'rd',
            _ => 'th',
          };
    return '$level$suffix Year';
  }
}
