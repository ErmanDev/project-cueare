import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/repositories.dart';
import '../../models/attendance_log_model.dart';
import '../../models/student_model.dart';

final myStudentProvider = FutureProvider.family<StudentModel, String>(
  (ref, code) => ref.watch(studentRepositoryProvider).myQr(code),
);

final myAttendanceProvider =
    FutureProvider.family<List<AttendanceLogModel>, String>(
      (ref, code) => ref.watch(studentRepositoryProvider).myAttendance(code),
    );
