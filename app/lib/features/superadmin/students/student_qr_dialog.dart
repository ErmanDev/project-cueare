import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../../models/student_model.dart';

/// Shows a student's QR code large enough to scan from another phone,
/// or to screenshot / print.
class StudentQrDialog extends StatelessWidget {
  const StudentQrDialog({super.key, required this.student});
  final StudentModel student;

  static Future<void> show(BuildContext context, StudentModel s) =>
      showDialog<void>(
        context: context,
        builder: (_) => StudentQrDialog(student: s),
      );

  @override
  Widget build(BuildContext context) {
    return Dialog(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            StudentQrCard(student: student),
            const SizedBox(height: 12),
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Close'),
            ),
          ],
        ),
      ),
    );
  }
}

/// White card with the QR + name + code (shared with the student's My QR screen).
class StudentQrCard extends StatelessWidget {
  const StudentQrCard({super.key, required this.student, this.size = 240});
  final StudentModel student;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.black12),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          QrImageView(
            data: student.qrData,
            version: QrVersions.auto,
            size: size,
            backgroundColor: Colors.white,
            errorCorrectionLevel: QrErrorCorrectLevel.M,
          ),
          const SizedBox(height: 12),
          Text(
            student.fullName,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Colors.black,
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
          ),
          if (student.programLine.isNotEmpty)
            Text(
              student.programLine,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.black54),
            ),
          const SizedBox(height: 4),
          Text(
            student.studentIdCode,
            style: const TextStyle(
              color: Colors.black87,
              fontFamily: 'monospace',
              letterSpacing: 1,
            ),
          ),
        ],
      ),
    );
  }
}
