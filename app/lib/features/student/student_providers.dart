import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/repositories.dart';
import '../../models/attendance_log_model.dart';
import '../../models/student_model.dart';

final myStudentProvider = FutureProvider.family<StudentModel, String>(
  (ref, code) => ref.watch(studentRepositoryProvider).myQr(code),
);

const _attendancePoll = Duration(seconds: 3);

bool attendanceSame(List<AttendanceLogModel> a, List<AttendanceLogModel> b) {
  if (identical(a, b)) return true;
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) {
    final left = a[i];
    final right = b[i];
    if (left.id != right.id ||
        left.status != right.status ||
        left.direction != right.direction ||
        left.scannedAt != right.scannedAt) {
      return false;
    }
  }
  return true;
}

/// Live attendance for the signed-in student. Refetches while this is watched
/// so a moderator scan appears without pull-to-refresh.
final myAttendanceProvider =
    StreamProvider.family<List<AttendanceLogModel>, String>((ref, code) async* {
      final repo = ref.watch(studentRepositoryProvider);
      List<AttendanceLogModel>? last;
      var first = true;
      while (true) {
        try {
          final next = await repo.myAttendance(code);
          if (last == null || !attendanceSame(last, next)) {
            last = next;
            yield next;
          }
          first = false;
        } catch (e) {
          if (first) rethrow;
        }
        await Future<void>.delayed(_attendancePoll);
      }
    });
