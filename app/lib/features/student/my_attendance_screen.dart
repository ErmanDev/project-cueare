import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/utils/formatters.dart';
import '../../models/attendance_log_model.dart';
import '../../widgets/async_value_widget.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/status_chip.dart';
import 'student_providers.dart';

class MyAttendanceScreen extends ConsumerWidget {
  const MyAttendanceScreen({super.key, required this.studentIdCode});
  final String studentIdCode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final logs = ref.watch(myAttendanceProvider(studentIdCode));

    return RefreshIndicator(
      onRefresh: () => ref.refresh(myAttendanceProvider(studentIdCode).future),
      child: AsyncValueWidget(
        value: logs,
        onRetry: () => ref.invalidate(myAttendanceProvider(studentIdCode)),
        data: (list) {
          if (list.isEmpty) {
            return const EmptyState(
              icon: Icons.history,
              title: 'No attendance yet',
              subtitle:
                  'Your scans will show up here once a moderator scans you.',
            );
          }
          final groups = <String, List<AttendanceLogModel>>{};
          for (final l in list) {
            final key = '${l.eventName ?? 'Event'}|${Fmt.date(l.scannedAt)}';
            groups.putIfAbsent(key, () => []).add(l);
          }
          return ListView(
            padding: AppListPadding.compact,
            children: [
              for (final entry in groups.entries)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          entry.key.split('|')[0],
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          entry.key.split('|')[1],
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                        const SizedBox(height: 10),
                        for (final l in entry.value.reversed)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 6),
                            child: Row(
                              children: [
                                StatusChip.direction(l.direction),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(
                                    l.sessionLabel ?? 'Session',
                                    style: Theme.of(
                                      context,
                                    ).textTheme.bodyMedium,
                                  ),
                                ),
                                Text(
                                  Fmt.time(l.scannedAt),
                                  style: Theme.of(context).textTheme.labelLarge
                                      ?.copyWith(
                                        color: Theme.of(
                                          context,
                                        ).colorScheme.onSurfaceVariant,
                                      ),
                                ),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}
