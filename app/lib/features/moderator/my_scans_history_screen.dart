import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../widgets/async_value_widget.dart';
import 'moderator_providers.dart';

/// Read-only list of the moderator's own confirmed scans today.
class MyScansHistoryScreen extends ConsumerWidget {
  const MyScansHistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scans = ref.watch(myScansProvider);
    final event = ref.watch(selectedEventProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('My scans today'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(myScansProvider),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(myScansProvider.future),
        child: AsyncValueWidget(
          value: scans,
          onRetry: () => ref.invalidate(myScansProvider),
          data: (list) {
            if (list.isEmpty) {
              return EmptyState(
                icon: Icons.history,
                title: 'No scans yet today',
                subtitle: event == null ? null : 'Event: ${event.name}',
              );
            }
            final ins = list.where((l) => l.isIn).length;
            final outs = list.length - ins;
            return ListView.separated(
              itemCount: list.length + 1,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, i) {
                if (i == 0) {
                  return Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        _Stat(label: 'Total', value: list.length),
                        _Stat(label: 'IN', value: ins, color: AppTheme.inColor),
                        _Stat(
                          label: 'OUT',
                          value: outs,
                          color: AppTheme.outColor,
                        ),
                      ],
                    ),
                  );
                }
                final l = list[i - 1];
                final color = l.isIn ? AppTheme.inColor : AppTheme.outColor;
                return ListTile(
                  leading: Container(
                    width: 52,
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      l.direction,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: color,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  title: Text(l.studentName ?? 'Student #${l.studentId}'),
                  subtitle: Text(
                    '${l.studentIdCode ?? ''} · ${l.sessionLabel ?? ''}',
                  ),
                  trailing: Text(Fmt.time(l.scannedAt)),
                );
              },
            );
          },
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value, this.color});
  final String label;
  final int value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Card(
        margin: const EdgeInsets.symmetric(horizontal: 4),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Column(
            children: [
              Text(
                '$value',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  color: color,
                  fontWeight: FontWeight.w800,
                ),
              ),
              Text(label, style: Theme.of(context).textTheme.labelMedium),
            ],
          ),
        ),
      ),
    );
  }
}
