import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/student_fine_model.dart';
import '../../widgets/async_value_widget.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/status_chip.dart';
import 'student_providers.dart';

class MyFinesScreen extends ConsumerWidget {
  const MyFinesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final fines = ref.watch(myFinesProvider);

    return RefreshIndicator(
      onRefresh: () => ref.refresh(myFinesProvider.future),
      child: AsyncValueWidget(
        value: fines,
        onRetry: () => ref.invalidate(myFinesProvider),
        loadingMessage: 'Loading your fines…',
        data: (list) {
          if (list.isEmpty) {
            return const EmptyState(
              icon: Icons.payments_outlined,
              title: 'No fines',
              subtitle:
                  'If a session is closed and you have a violation, the fine will show here under that event.',
            );
          }
          final groups = <int, List<StudentFineModel>>{};
          for (final fine in list) {
            groups.putIfAbsent(fine.eventId, () => []).add(fine);
          }
          return ListView(
            padding: AppListPadding.standard,
            children: [
              for (final entry in groups.entries)
                _EventFinesCard(fines: entry.value),
            ],
          );
        },
      ),
    );
  }
}

class _EventFinesCard extends StatelessWidget {
  const _EventFinesCard({required this.fines});
  final List<StudentFineModel> fines;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final eventName = fines.first.eventName;
    final openTotal = fines.fold<double>(
      0,
      (sum, f) => sum + f.outstandingAmount,
    );
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(eventName, style: text.titleMedium)),
                Text(
                  fines.first.currencyCode == 'PHP'
                      ? '₱${openTotal.toStringAsFixed(2)}'
                      : openTotal.toStringAsFixed(2),
                  style: text.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
              ],
            ),
            const SizedBox(height: 10),
            for (final fine in fines)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  children: [
                    StatusChip(
                      label: fine.isOpen ? 'Due' : fine.status,
                      tone: fine.isOpen
                          ? StatusChipTone.danger
                          : StatusChipTone.neutral,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        '${fine.sessionName} · ${fine.violationLabel}',
                        style: text.bodyMedium,
                      ),
                    ),
                    Text(fine.amountLabel, style: text.labelLarge),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
