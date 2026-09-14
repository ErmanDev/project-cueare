/// All server routes in one place (mirrors /server REST API under /api).
abstract class ApiEndpoints {
  static const prefix = '/api';

  static const health = '$prefix/health';

  // Auth
  static const login = '$prefix/auth/login';
  static const me = '$prefix/auth/me';
  static const changePassword = '$prefix/auth/change-password';

  // Superadmin
  static const moderators = '$prefix/admin/moderators';
  static const moderatorsFromStudent = '$prefix/admin/moderators/from-student';
  static String moderator(int id) => '$prefix/admin/moderators/$id';
  static String moderatorDemote(int id) => '$prefix/admin/moderators/$id/demote';

  static const students = '$prefix/admin/students';
  static String student(int id) => '$prefix/admin/students/$id';
  static const studentsImport = '$prefix/admin/students/import';

  static const sections = '$prefix/admin/sections';
  static String section(int id) => '$prefix/admin/sections/$id';

  static const events = '$prefix/admin/events';
  static String event(int id) => '$prefix/admin/events/$id';
  static String eventSessionWindows(int eventId) =>
      '$prefix/admin/events/$eventId/session-windows';
  static String eventParticipants(int eventId) =>
      '$prefix/admin/events/$eventId/participants';
  static String eventParticipant(int eventId, int studentId) =>
      '$prefix/admin/events/$eventId/participants/$studentId';
  static String eventParticipantsSync(int eventId) =>
      '$prefix/admin/events/$eventId/participants/sync';
  static String eventTokens(int eventId) =>
      '$prefix/admin/events/$eventId/tokens';
  static String eventTokenRevoke(int eventId, int tokenId) =>
      '$prefix/admin/events/$eventId/tokens/$tokenId/revoke';
  static String eventTokenReissue(int eventId, int tokenId) =>
      '$prefix/admin/events/$eventId/tokens/$tokenId/reissue';
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

  // Student
  static const studentEvents = '$prefix/student/me/events';
  static const studentFines = '$prefix/student/me/fines';
  static String studentEventQr(int eventId) =>
      '$prefix/student/me/events/$eventId/qr';
  static String studentQr(String code) =>
      '$prefix/student/${Uri.encodeComponent(code)}/qr';
  static String studentAttendance(String code) =>
      '$prefix/student/${Uri.encodeComponent(code)}/attendance';
}
