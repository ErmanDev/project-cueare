/// All server routes in one place (mirrors /server REST API under /api).
abstract class ApiEndpoints {
  static const prefix = '/api';

  static const health = '$prefix/health';

  // Auth
  static const login = '$prefix/auth/login';
  static const me = '$prefix/auth/me';

  // Superadmin
  static const moderators = '$prefix/admin/moderators';
  static String moderator(int id) => '$prefix/admin/moderators/$id';

  static const students = '$prefix/admin/students';
  static String student(int id) => '$prefix/admin/students/$id';
  static const studentsImport = '$prefix/admin/students/import';

  static const events = '$prefix/admin/events';
  static String event(int id) => '$prefix/admin/events/$id';
  static String eventSessionWindows(int eventId) =>
      '$prefix/admin/events/$eventId/session-windows';
  static String sessionWindow(int id) => '$prefix/admin/session-windows/$id';

  static const attendance = '$prefix/admin/attendance';
  static String attendanceRecord(int id) => '$prefix/admin/attendance/$id';
  static const attendanceExport = '$prefix/admin/attendance/export';

  // Moderator
  static const activeEvents = '$prefix/moderator/events/active';
  static const moderatorSessionWindows = '$prefix/moderator/session-windows';
  static const scanPreview = '$prefix/moderator/scan/preview';
  static const scanConfirm = '$prefix/moderator/scan/confirm';
  static const scanCancel = '$prefix/moderator/scan/cancel';
  static const myScans = '$prefix/moderator/scans/mine';

  // Student (no auth)
  static String studentQr(String code) =>
      '$prefix/student/${Uri.encodeComponent(code)}/qr';
  static String studentAttendance(String code) =>
      '$prefix/student/${Uri.encodeComponent(code)}/attendance';
}
