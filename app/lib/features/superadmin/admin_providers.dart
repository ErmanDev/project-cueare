import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/repositories.dart';
import '../../models/attendance_log_model.dart';
import '../../models/event_model.dart';
import '../../models/student_model.dart';
import '../../models/user_model.dart';

final moderatorsProvider = FutureProvider<List<UserModel>>(
  (ref) => ref.watch(adminRepositoryProvider).moderators(),
);

/// Search text for the students list.
class StudentSearchNotifier extends Notifier<String> {
  @override
  String build() => '';
  void set(String v) => state = v;
}

final studentSearchProvider = NotifierProvider<StudentSearchNotifier, String>(
  StudentSearchNotifier.new,
);

final studentsProvider = FutureProvider<List<StudentModel>>((ref) {
  final q = ref.watch(studentSearchProvider);
  return ref.watch(adminRepositoryProvider).students(query: q);
});

final eventsProvider = FutureProvider<List<EventModel>>(
  (ref) => ref.watch(adminRepositoryProvider).events(),
);

final eventDetailProvider = FutureProvider.family<EventModel, int>(
  (ref, id) => ref.watch(adminRepositoryProvider).event(id),
);

/// Current filter for the attendance table.
class AttendanceFilterNotifier extends Notifier<AttendanceQuery> {
  @override
  AttendanceQuery build() => const AttendanceQuery(limit: 500);
  void set(AttendanceQuery q) => state = q;
}

final attendanceFilterProvider =
    NotifierProvider<AttendanceFilterNotifier, AttendanceQuery>(
      AttendanceFilterNotifier.new,
    );

final attendanceListProvider = FutureProvider<List<AttendanceLogModel>>((ref) {
  final filter = ref.watch(attendanceFilterProvider);
  return ref.watch(adminRepositoryProvider).attendance(filter);
});
