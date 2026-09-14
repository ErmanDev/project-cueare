import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/attendance_log_model.dart';
import '../../models/event_model.dart';
import '../../models/event_participant_model.dart';
import '../../models/scan_preview_model.dart';
import '../../models/section_model.dart';
import '../../models/session_window_model.dart';
import '../../models/student_event_model.dart';
import '../../models/student_fine_model.dart';
import '../../models/student_model.dart';
import '../../models/user_model.dart';
import '../utils/json_values.dart';
import 'api_client.dart';
import 'api_endpoints.dart';

String _date(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

// -----------------------------------------------------------------------------
// Superadmin
// -----------------------------------------------------------------------------

class AdminRepository {
  AdminRepository(this._api);
  final ApiClient _api;

  // Moderators
  Future<List<UserModel>> moderators() async {
    final list = await _api.getList(ApiEndpoints.moderators);
    return list
        .map((e) => UserModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<UserModel> createModerator({
    required String name,
    required String username,
    required String password,
  }) async {
    final json = await _api.postJson(ApiEndpoints.moderators, {
      'name': name,
      'username': username,
      'password': password,
    });
    return UserModel.fromJson(json);
  }

  Future<UserModel> promoteStudentToModerator(int studentId) async {
    final json = await _api.postJson(ApiEndpoints.moderatorsFromStudent, {
      'student_id': studentId,
    });
    return UserModel.fromJson(json);
  }

  Future<UserModel> updateModerator(
    int id, {
    String? name,
    String? username,
    String? password,
  }) async {
    final json = await _api.putJson(ApiEndpoints.moderator(id), {
      if (name != null) 'name': name,
      if (username != null) 'username': username,
      if (password != null && password.isNotEmpty) 'password': password,
    });
    return UserModel.fromJson(json);
  }

  Future<void> deleteModerator(int id) =>
      _api.delete(ApiEndpoints.moderator(id));

  Future<void> demoteModerator(int id) async {
    await _api.postJson(ApiEndpoints.moderatorDemote(id), {});
  }

  // Students
  Future<List<StudentModel>> students({String? query}) async {
    final list = await _api.getList(
      ApiEndpoints.students,
      query: query == null || query.isEmpty ? null : {'q': query},
    );
    return list
        .map((e) => StudentModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<({List<StudentModel> students, int total})> studentsPage({
    String? query,
    int page = 1,
    int perPage = 50,
  }) async {
    final json = await _api.getJson(ApiEndpoints.students, query: {
      if (query != null && query.isNotEmpty) 'q': query,
      'page': page,
      'per_page': perPage,
    });
    final list = (json['students'] as List<dynamic>? ?? [])
        .map((e) => StudentModel.fromJson(e as Map<String, dynamic>))
        .toList();
    return (students: list, total: asInt(json['total']) ?? list.length);
  }

  Future<List<SectionModel>> sections({String? query}) async {
    final list = await _api.getList(
      ApiEndpoints.sections,
      query: query == null || query.isEmpty ? null : {'q': query},
    );
    return list
        .map((e) => SectionModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<SectionBreakdown> section(int id) async =>
      SectionBreakdown.fromJson(await _api.getJson(ApiEndpoints.section(id)));

  Future<({List<EventParticipantModel> rows, int total})> eventParticipants(
    int eventId, {
    String? query,
    int limit = 200,
  }) async {
    final json = await _api.getJson(
      ApiEndpoints.eventParticipants(eventId),
      query: {
        if (query != null && query.isNotEmpty) 'q': query,
        'limit': limit,
      },
    );
    final rows = (json['rows'] as List<dynamic>? ?? [])
        .map((e) => EventParticipantModel.fromJson(e as Map<String, dynamic>))
        .toList();
    return (rows: rows, total: asInt(json['total']) ?? rows.length);
  }

  Future<({int addedCount, int total})> addEventParticipants(
    int eventId, {
    List<int>? studentIds,
    int? sectionId,
  }) async {
    final json = await _api.postJson(ApiEndpoints.eventParticipants(eventId), {
      if (studentIds != null && studentIds.isNotEmpty) 'student_ids': studentIds,
      if (sectionId != null) 'section_id': sectionId,
    });
    return (
      addedCount: asInt(json['added_count']) ?? 0,
      total: asInt(json['total_participants']) ?? 0,
    );
  }

  Future<void> removeEventParticipant(int eventId, int studentId) =>
      _api.delete(ApiEndpoints.eventParticipant(eventId, studentId));

  Future<int> syncEventRoster(int eventId) async {
    final json = await _api.postJson(
      ApiEndpoints.eventParticipantsSync(eventId),
      {},
    );
    return asInt(json['participant_count']) ?? 0;
  }

  Future<List<EventParticipantTokenModel>> generateEventTokens(
    int eventId,
  ) async {
    final json = await _api.postJson(ApiEndpoints.eventTokens(eventId), {});
    return (json['tokens'] as List<dynamic>? ?? [])
        .map(
          (e) => EventParticipantTokenModel.fromJson(e as Map<String, dynamic>),
        )
        .toList();
  }

  Future<void> revokeEventToken(int eventId, int tokenId) async {
    await _api.postJson(ApiEndpoints.eventTokenRevoke(eventId, tokenId), {});
  }

  Future<void> reissueEventToken(int eventId, int tokenId) async {
    await _api.postJson(ApiEndpoints.eventTokenReissue(eventId, tokenId), {});
  }

  Future<StudentModel> createStudent({
    required String studentIdCode,
    required String fullName,
    String? section,
    String? photoUrl,
  }) async {
    final json = await _api.postJson(ApiEndpoints.students, {
      'student_id_code': studentIdCode,
      'full_name': fullName,
      'section': section,
      'photo_url': photoUrl,
    });
    return StudentModel.fromJson(json);
  }

  Future<StudentModel> updateStudent(
    int id, {
    String? studentIdCode,
    String? fullName,
    String? section,
    String? photoUrl,
  }) async {
    final json = await _api.putJson(ApiEndpoints.student(id), {
      if (studentIdCode != null) 'student_id_code': studentIdCode,
      if (fullName != null) 'full_name': fullName,
      'section': section,
      'photo_url': photoUrl,
    });
    return StudentModel.fromJson(json);
  }

  Future<void> deleteStudent(int id) => _api.delete(ApiEndpoints.student(id));

  /// Returns {created, updated, skipped, errors, total_rows}.
  Future<Map<String, dynamic>> importStudentsCsv(
    String csv, {
    bool skipExisting = false,
  }) => _api.postJson(ApiEndpoints.studentsImport, {
    'csv': csv,
  }, query: skipExisting ? {'mode': 'skip'} : null);

  // Events
  Future<List<EventModel>> events() async {
    final list = await _api.getList(ApiEndpoints.events);
    return list
        .map((e) => EventModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<EventModel> event(int id) async =>
      EventModel.fromJson(await _api.getJson(ApiEndpoints.event(id)));

  Future<EventModel> createEvent({
    required String name,
    required DateTime eventDate,
    bool isActive = true,
    List<({String label, String start, String end})> windows = const [],
  }) async {
    final json = await _api.postJson(ApiEndpoints.events, {
      'name': name,
      'event_date': _date(eventDate),
      'is_active': isActive,
      'session_windows': [
        for (final w in windows)
          {'session_label': w.label, 'start_time': w.start, 'end_time': w.end},
      ],
    });
    return EventModel.fromJson(json);
  }

  Future<EventModel> updateEvent(
    int id, {
    String? name,
    DateTime? eventDate,
    bool? isActive,
  }) async {
    final json = await _api.putJson(ApiEndpoints.event(id), {
      if (name != null) 'name': name,
      if (eventDate != null) 'event_date': _date(eventDate),
      if (isActive != null) 'is_active': isActive,
    });
    return EventModel.fromJson(json);
  }

  Future<void> deleteEvent(int id) => _api.delete(ApiEndpoints.event(id));

  // Session windows
  Future<SessionWindowModel> createSessionWindow(
    int eventId, {
    required String label,
    required String start,
    required String end,
    int? sortOrder,
  }) async {
    final json = await _api
        .postJson(ApiEndpoints.eventSessionWindows(eventId), {
          'session_label': label,
          'start_time': start,
          'end_time': end,
          if (sortOrder != null) 'sort_order': sortOrder,
        });
    return SessionWindowModel.fromJson(json);
  }

  Future<SessionWindowModel> updateSessionWindow(
    int id, {
    String? label,
    String? start,
    String? end,
    int? sortOrder,
  }) async {
    final json = await _api.putJson(ApiEndpoints.sessionWindow(id), {
      if (label != null) 'session_label': label,
      if (start != null) 'start_time': start,
      if (end != null) 'end_time': end,
      if (sortOrder != null) 'sort_order': sortOrder,
    });
    return SessionWindowModel.fromJson(json);
  }

  Future<void> deleteSessionWindow(int id, {bool force = false}) => _api.delete(
    ApiEndpoints.sessionWindow(id),
    query: force ? {'force': 'true'} : null,
  );

  // Attendance
  Future<List<AttendanceLogModel>> attendance(AttendanceQuery q) async {
    final list = await _api.getList(
      ApiEndpoints.attendance,
      query: q.toQuery(),
    );
    return list
        .map((e) => AttendanceLogModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<AttendanceLogModel> updateAttendance(
    int id, {
    String? direction,
    int? sessionWindowId,
    String? status,
    DateTime? scannedAt,
    String? deviceNote,
  }) async {
    final json = await _api.putJson(ApiEndpoints.attendanceRecord(id), {
      if (direction != null) 'direction': direction,
      if (sessionWindowId != null) 'session_window_id': sessionWindowId,
      if (status != null) 'status': status,
      if (scannedAt != null) 'scanned_at': scannedAt.toIso8601String(),
      if (deviceNote != null) 'device_note': deviceNote,
    });
    return AttendanceLogModel.fromJson(json);
  }

  Future<void> deleteAttendance(int id) =>
      _api.delete(ApiEndpoints.attendanceRecord(id));

  Future<String> exportAttendanceCsv(AttendanceQuery q) =>
      _api.getText(ApiEndpoints.attendanceExport, query: q.toQuery());
}

class AttendanceQuery {
  const AttendanceQuery({
    this.eventId,
    this.date,
    this.studentId,
    this.sessionWindowId,
    this.status,
    this.search,
    this.limit,
  });

  final int? eventId;
  final DateTime? date;
  final int? studentId;
  final int? sessionWindowId;
  final String? status;
  final String? search;
  final int? limit;

  AttendanceQuery copyWith({
    int? Function()? eventId,
    DateTime? Function()? date,
    int? Function()? studentId,
    int? Function()? sessionWindowId,
    String? Function()? status,
    String? Function()? search,
  }) => AttendanceQuery(
    eventId: eventId == null ? this.eventId : eventId(),
    date: date == null ? this.date : date(),
    studentId: studentId == null ? this.studentId : studentId(),
    sessionWindowId: sessionWindowId == null
        ? this.sessionWindowId
        : sessionWindowId(),
    status: status == null ? this.status : status(),
    search: search == null ? this.search : search(),
    limit: limit,
  );

  Map<String, dynamic> toQuery() => {
    if (eventId != null) 'event_id': eventId,
    if (date != null) 'date': _date(date!),
    if (studentId != null) 'student_id': studentId,
    if (sessionWindowId != null) 'session_window_id': sessionWindowId,
    if (status != null) 'status': status,
    if (search != null && search!.isNotEmpty) 'q': search,
    if (limit != null) 'limit': limit,
  };

  @override
  bool operator ==(Object other) =>
      other is AttendanceQuery &&
      other.eventId == eventId &&
      other.date == date &&
      other.studentId == studentId &&
      other.sessionWindowId == sessionWindowId &&
      other.status == status &&
      other.search == search &&
      other.limit == limit;

  @override
  int get hashCode => Object.hash(
    eventId,
    date,
    studentId,
    sessionWindowId,
    status,
    search,
    limit,
  );
}

// -----------------------------------------------------------------------------
// Moderator
// -----------------------------------------------------------------------------

class ModeratorRepository {
  ModeratorRepository(this._api);
  final ApiClient _api;

  Future<List<EventModel>> activeEvents() async {
    final json = await _api.getJson(ApiEndpoints.activeEvents);
    return (json['events'] as List<dynamic>)
        .map((e) => EventModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<ScanPreviewModel> preview({
    required int eventId,
    required String qrPayload,
    int? sessionWindowId,
  }) async {
    final json = await _api.postJson(ApiEndpoints.scanPreview, {
      'event_id': eventId,
      'student_id_code': qrPayload,
      if (sessionWindowId != null) 'session_window_id': sessionWindowId,
    });
    return ScanPreviewModel.fromJson(json);
  }

  Future<AttendanceLogModel> confirm(ScanPreviewModel p, {String? note}) async {
    final json = await _api.postJson(ApiEndpoints.scanConfirm, {
      'event_id': p.eventId,
      'student_id': p.student.id,
      'session_window_id': p.sessionWindowId,
      'direction': p.computedDirection,
      if (note != null) 'device_note': note,
    });
    return AttendanceLogModel.fromJson(json);
  }

  Future<void> cancel(ScanPreviewModel p) =>
      _api.postJson(ApiEndpoints.scanCancel, {
        'event_id': p.eventId,
        'student_id': p.student.id,
        'session_window_id': p.sessionWindowId,
        'direction': p.computedDirection == 'ALREADY_COMPLETE'
            ? 'IN'
            : p.computedDirection,
      });

  Future<List<AttendanceLogModel>> myScans({
    int? eventId,
    bool allDates = false,
    bool includeCancelled = false,
  }) async {
    final list = await _api.getList(
      ApiEndpoints.myScans,
      query: {
        if (eventId != null) 'event_id': eventId,
        if (allDates) 'date': 'all',
        if (includeCancelled) 'status': 'all',
      },
    );
    return list
        .map((e) => AttendanceLogModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}

// -----------------------------------------------------------------------------
// Student (no auth)
// -----------------------------------------------------------------------------

class StudentRepository {
  StudentRepository(this._api);
  final ApiClient _api;

  Future<List<StudentEventModel>> myEvents() async {
    final json = await _api.getJson(ApiEndpoints.studentEvents);
    return (json['events'] as List<dynamic>? ?? [])
        .map((e) => StudentEventModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<StudentEventQrModel> myEventQr(int eventId) async {
    final json = await _api.getJson(ApiEndpoints.studentEventQr(eventId));
    return StudentEventQrModel.fromJson(json);
  }

  Future<List<StudentFineModel>> myFines() async {
    final json = await _api.getJson(ApiEndpoints.studentFines);
    return (json['fines'] as List<dynamic>? ?? [])
        .map((e) => StudentFineModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<StudentModel> myQr(String code) async {
    final json = await _api.getJson(ApiEndpoints.studentQr(code));
    final student = StudentModel.fromJson(
      json['student'] as Map<String, dynamic>,
    );
    return student.copyWith(qrPayload: json['qr_payload'] as String?);
  }

  Future<List<AttendanceLogModel>> myAttendance(String code) async {
    final json = await _api.getJson(ApiEndpoints.studentAttendance(code));
    return (json['attendance'] as List<dynamic>)
        .map((e) => AttendanceLogModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}

// -----------------------------------------------------------------------------
// Providers
// -----------------------------------------------------------------------------

final adminRepositoryProvider = Provider<AdminRepository>(
  (ref) => AdminRepository(ref.watch(apiClientProvider)),
);

final moderatorRepositoryProvider = Provider<ModeratorRepository>(
  (ref) => ModeratorRepository(ref.watch(apiClientProvider)),
);

final studentRepositoryProvider = Provider<StudentRepository>(
  (ref) => StudentRepository(ref.watch(apiClientProvider)),
);
