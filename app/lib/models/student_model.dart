class StudentModel {
  const StudentModel({
    required this.id,
    required this.studentIdCode,
    required this.fullName,
    this.section,
    this.photoUrl,
    this.qrPayload,
    this.createdAt,
  });

  final int id;
  final String studentIdCode;
  final String fullName;
  final String? section;
  final String? photoUrl;

  /// What to encode in the QR. Falls back to the code itself.
  final String? qrPayload;
  final DateTime? createdAt;

  String get qrData => qrPayload ?? studentIdCode;

  factory StudentModel.fromJson(Map<String, dynamic> json) => StudentModel(
    id: json['id'] as int,
    studentIdCode: json['student_id_code'] as String,
    fullName: json['full_name'] as String? ?? '',
    section: json['section'] as String?,
    photoUrl: json['photo_url'] as String?,
    qrPayload: json['qr_payload'] as String?,
    createdAt: json['created_at'] == null
        ? null
        : DateTime.tryParse(json['created_at'] as String),
  );
}
