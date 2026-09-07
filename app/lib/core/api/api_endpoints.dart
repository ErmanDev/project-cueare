/// All server routes in one place (mirrors /server/routes).
abstract class ApiEndpoints {
  static const health = '/health';

  // Auth
  static const login = '/auth/login';
  static const me = '/auth/me';

  // Superadmin
  static const moderators = '/admin/moderators';
  static String moderator(int id) => '/admin/moderators/$id';

  static const students = '/admin/students';
  static String student(int id) => '/admin/students/$id';
  static const studentsImport = '/admin/students/import';

  static const events = '/admin/events';
  static String event(int id) => '/admin/events/$id';
  static String eventSessionWindows(int eventId) =>
      '/admin/events/$eventId/session-windows';
  static String sessionWindow(int id) => '/admin/session-windows/$id';

  static const attendance = '/admin/attendance';
  static String attendanceRecord(int id) => '/admin/attendance/$id';
  static const attendanceExport = '/admin/attendance/export';

  // Moderator
  static const activeEvents = '/moderator/events/active';
  static const moderatorSessionWindows = '/moderator/session-windows';
  static const scanPreview = '/moderator/scan/preview';
  static const scanConfirm = '/moderator/scan/confirm';
  static const scanCancel = '/moderator/scan/cancel';
  static const myScans = '/moderator/scans/mine';

  // Student (no auth)
  static String studentQr(String code) =>
      '/student/${Uri.encodeComponent(code)}/qr';
  static String studentAttendance(String code) =>
      '/student/${Uri.encodeComponent(code)}/attendance';
}
