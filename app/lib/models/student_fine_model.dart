import '../core/utils/json_values.dart';

class StudentFineModel {
  const StudentFineModel({
    required this.assessmentId,
    required this.eventId,
    required this.eventName,
    required this.sessionName,
    required this.violationCode,
    required this.assessedAmount,
    required this.outstandingAmount,
    required this.status,
    this.currencyCode = 'PHP',
  });

  final int assessmentId;
  final int eventId;
  final String eventName;
  final String sessionName;
  final String violationCode;
  final double assessedAmount;
  final double outstandingAmount;
  final String status;
  final String currencyCode;

  bool get isOpen => outstandingAmount > 0;

  String get violationLabel {
    final raw = violationCode.replaceAll('_', ' ').toLowerCase();
    if (raw.isEmpty) return 'Fine';
    return raw
        .split(' ')
        .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}')
        .join(' ');
  }

  String get amountLabel {
    final symbol = currencyCode == 'PHP' ? '₱' : '$currencyCode ';
    return '$symbol${outstandingAmount.toStringAsFixed(2)}';
  }

  factory StudentFineModel.fromJson(Map<String, dynamic> json) =>
      StudentFineModel(
        assessmentId: asInt(json['assessment_id']) ?? 0,
        eventId: asInt(json['event_id']) ?? 0,
        eventName: json['event_name'] as String? ?? 'Event',
        sessionName: json['session_name'] as String? ?? 'Session',
        violationCode: json['violation_code'] as String? ?? '',
        assessedAmount: _money(json['assessed_amount']),
        outstandingAmount: _money(json['outstanding_amount']),
        status: json['status'] as String? ?? '',
        currencyCode: json['currency_code'] as String? ?? 'PHP',
      );
}

double _money(dynamic value) {
  if (value is num) return value.toDouble();
  return double.tryParse(value?.toString() ?? '') ?? 0;
}
