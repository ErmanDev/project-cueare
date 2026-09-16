class SelfScanResultModel {
  const SelfScanResultModel({
    required this.scanResultCode,
    this.failureReasonCode,
    this.eventId,
    this.eventName,
    this.eventSessionId,
    this.sessionName,
    this.studentId,
    this.studentNumber,
    this.studentFullName,
    this.actionRecorded,
    this.attendanceStatus,
    this.recordedAtUtc,
    required this.message,
  });

  factory SelfScanResultModel.fromJson(Map<String, dynamic> json) {
    return SelfScanResultModel(
      scanResultCode: json['scanResultCode'] as String? ?? 'REJECTED',
      failureReasonCode: json['failureReasonCode'] as String?,
      eventId: json['eventId']?.toString(),
      eventName: json['eventName'] as String?,
      eventSessionId: json['eventSessionId']?.toString(),
      sessionName: json['sessionName'] as String?,
      studentId: json['studentId']?.toString(),
      studentNumber: json['studentNumber'] as String?,
      studentFullName: json['studentFullName'] as String?,
      actionRecorded: json['actionRecorded'] as String?,
      attendanceStatus: json['attendanceStatus'] as String?,
      recordedAtUtc: json['recordedAtUtc'] as String?,
      message: json['message'] as String? ?? 'Scan processed.',
    );
  }

  final String scanResultCode;
  final String? failureReasonCode;
  final String? eventId;
  final String? eventName;
  final String? eventSessionId;
  final String? sessionName;
  final String? studentId;
  final String? studentNumber;
  final String? studentFullName;
  final String? actionRecorded;
  final String? attendanceStatus;
  final String? recordedAtUtc;
  final String message;

  bool get isAccepted =>
      scanResultCode == 'ACCEPTED' || scanResultCode == 'NO_CHANGE';

  String get userMessage {
    if (isAccepted) return message;
    return switch (failureReasonCode) {
      'STUDENT_ACCOUNT_NOT_LINKED' =>
        'Account Not Linked: Your user account is not linked to a student profile. Ask an admin to link your account.',
      'NOT_ON_SESSION_ROSTER' =>
        'Not Registered: You are not registered in the participant roster for this event session.',
      'EXPIRED_QR_TOKEN' =>
        'QR Expired: The venue QR code has rotated or expired. Please scan the current venue screen.',
      'INVALID_QR_TOKEN' =>
        'Invalid QR: Scanned code is not a valid venue QR token.',
      'REVOKED_QR_TOKEN' =>
        'QR Revoked: This venue QR token was revoked by an admin.',
      'SESSION_CLOSED' =>
        'Session Closed: Attendance check-in for this session is closed.',
      'EVENT_NOT_PUBLISHED' =>
        'Event Inactive: This event is not active or published yet.',
      'EVENT_CANCELLED' =>
        'Event Cancelled: This event has been cancelled.',
      _ => message.isNotEmpty ? message : 'Scan rejected (${failureReasonCode ?? 'Unknown'})',
    };
  }
}
