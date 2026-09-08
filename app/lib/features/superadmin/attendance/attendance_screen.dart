import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/repositories.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../models/attendance_log_model.dart';
import '../../../widgets/async_value_widget.dart';
import '../../../widgets/error_banner.dart';
import '../../../widgets/page_scaffold.dart';
import '../admin_providers.dart';
import 'attendance_edit_dialog.dart';

class AttendanceScreen extends ConsumerStatefulWidget {
  const AttendanceScreen({super.key});

  @override
  ConsumerState<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends ConsumerState<AttendanceScreen> {
  final _search = TextEditingController();
  bool _exporting = false;

  @override
  void initState() {
    super.initState();
    _search.text = ref.read(attendanceFilterProvider).search ?? '';
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  AttendanceQuery get _filter => ref.read(attendanceFilterProvider);
  void _setFilter(AttendanceQuery q) =>
      ref.read(attendanceFilterProvider.notifier).set(q);

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _filter.date ?? DateTime.now(),
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (picked != null) _setFilter(_filter.copyWith(date: () => picked));
  }

  Future<void> _delete(AttendanceLogModel log) async {
    final ok = await confirmDialog(
      context,
      title: 'Delete record?',
      message:
          '${log.studentName ?? 'Student'} — ${log.sessionLabel ?? ''} '
          '${log.direction} at ${Fmt.time(log.scannedAt)}.\n\n'
          'Deleting an IN allows the student to be scanned IN again.',
    );
    if (!ok) return;
    try {
      await ref.read(adminRepositoryProvider).deleteAttendance(log.id);
      ref.invalidate(attendanceListProvider);
      if (mounted) showSnack(context, 'Record deleted');
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    }
  }

  Future<void> _export() async {
    setState(() => _exporting = true);
    try {
      final csv = await ref
          .read(adminRepositoryProvider)
          .exportAttendanceCsv(
            AttendanceQuery(
              eventId: _filter.eventId,
              date: _filter.date,
              studentId: _filter.studentId,
              sessionWindowId: _filter.sessionWindowId,
              status: _filter.status,
              search: _filter.search,
            ),
          );
      await Clipboard.setData(ClipboardData(text: csv));
      if (!mounted) return;
      final lines = csv.trim().split('\n').length - 1;
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text('CSV copied ($lines rows)'),
          content: SizedBox(
            width: 600,
            child: SingleChildScrollView(
              child: SelectableText(
                csv,
                style: const TextStyle(fontFamily: 'monospace', fontSize: 11),
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Close'),
            ),
          ],
        ),
      );
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final filter = ref.watch(attendanceFilterProvider);
    final events = ref.watch(eventsProvider);
    final list = ref.watch(attendanceListProvider);
    final scheme = Theme.of(context).colorScheme;

    final selectedEvent = events.value
        ?.where((e) => e.id == filter.eventId)
        .firstOrNull;
    final windows = selectedEvent?.sessionWindows ?? const [];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Attendance records'),
        actions: [
          IconButton(
            tooltip: 'Export CSV (copies to clipboard)',
            icon: _exporting
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.download),
            onPressed: _exporting ? null : _export,
          ),
        ],
      ),
      body: AppContentWidth(
        child: Column(
        children: [
          // ---- filters ----
          Material(
            color: scheme.surfaceContainerLow,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              child: Column(
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: DropdownButtonFormField<int?>(
                          initialValue: filter.eventId,
                          isExpanded: true,
                          decoration: const InputDecoration(labelText: 'Event'),
                          items: [
                            const DropdownMenuItem(
                              value: null,
                              child: Text('All events'),
                            ),
                            for (final e in events.value ?? [])
                              DropdownMenuItem(
                                value: e.id,
                                child: Text(
                                  e.name,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                          ],
                          onChanged: (v) => _setFilter(
                            filter.copyWith(
                              eventId: () => v,
                              sessionWindowId: () => null,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: DropdownButtonFormField<int?>(
                          initialValue:
                              windows.any((w) => w.id == filter.sessionWindowId)
                              ? filter.sessionWindowId
                              : null,
                          isExpanded: true,
                          decoration: const InputDecoration(
                            labelText: 'Session',
                          ),
                          items: [
                            const DropdownMenuItem(
                              value: null,
                              child: Text('All'),
                            ),
                            for (final w in windows)
                              DropdownMenuItem(
                                value: w.id,
                                child: Text(w.sessionLabel),
                              ),
                          ],
                          onChanged: windows.isEmpty
                              ? null
                              : (v) => _setFilter(
                                  filter.copyWith(sessionWindowId: () => v),
                                ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _search,
                          decoration: InputDecoration(
                            labelText: 'Student name / code',
                            prefixIcon: const Icon(Icons.search),
                            suffixIcon: _search.text.isEmpty
                                ? null
                                : IconButton(
                                    icon: const Icon(Icons.clear),
                                    onPressed: () {
                                      _search.clear();
                                      _setFilter(
                                        filter.copyWith(search: () => null),
                                      );
                                    },
                                  ),
                          ),
                          onSubmitted: (v) => _setFilter(
                            filter.copyWith(search: () => v.trim()),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      OutlinedButton.icon(
                        onPressed: _pickDate,
                        icon: const Icon(Icons.calendar_today, size: 18),
                        label: Text(
                          filter.date == null
                              ? 'Any date'
                              : Fmt.dateShort(filter.date!),
                        ),
                      ),
                      if (filter.date != null)
                        IconButton(
                          tooltip: 'Clear date',
                          icon: const Icon(Icons.close),
                          onPressed: () =>
                              _setFilter(filter.copyWith(date: () => null)),
                        ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      const Text('Status: '),
                      const SizedBox(width: 4),
                      SegmentedButton<String>(
                        style: const ButtonStyle(
                          visualDensity: VisualDensity.compact,
                        ),
                        segments: const [
                          ButtonSegment(value: 'all', label: Text('All')),
                          ButtonSegment(
                            value: 'confirmed',
                            label: Text('Confirmed'),
                          ),
                          ButtonSegment(
                            value: 'cancelled',
                            label: Text('Cancelled'),
                          ),
                        ],
                        selected: {filter.status ?? 'all'},
                        onSelectionChanged: (s) => _setFilter(
                          filter.copyWith(
                            status: () => s.first == 'all' ? null : s.first,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          // ---- list ----
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => ref.refresh(attendanceListProvider.future),
              child: AsyncValueWidget(
                value: list,
                onRetry: () => ref.invalidate(attendanceListProvider),
                data: (rows) {
                  if (rows.isEmpty) {
                    return const EmptyState(
                      icon: Icons.fact_check_outlined,
                      title: 'No records match',
                    );
                  }
                  return ListView.separated(
                    itemCount: rows.length + 1,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (context, i) {
                      if (i == 0) {
                        return Padding(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                          child: Text(
                            '${rows.length} record${rows.length == 1 ? '' : 's'}',
                            style: Theme.of(context).textTheme.labelMedium,
                          ),
                        );
                      }
                      return _AttendanceRow(
                        log: rows[i - 1],
                        onEdit: () =>
                            AttendanceEditDialog.show(context, rows[i - 1]),
                        onDelete: () => _delete(rows[i - 1]),
                      );
                    },
                  );
                },
              ),
            ),
          ),
        ],
        ),
      ),
    );
  }
}

class _AttendanceRow extends StatelessWidget {
  const _AttendanceRow({
    required this.log,
    required this.onEdit,
    required this.onDelete,
  });
  final AttendanceLogModel log;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final color = !log.isConfirmed
        ? scheme.outline
        : log.isIn
        ? AppTheme.inColor
        : AppTheme.outColor;
    return ListTile(
      leading: Container(
        width: 52,
        padding: const EdgeInsets.symmetric(vertical: 6),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(
          log.direction,
          textAlign: TextAlign.center,
          style: TextStyle(color: color, fontWeight: FontWeight.w800),
        ),
      ),
      title: Text(
        log.studentName ?? 'Student #${log.studentId}',
        style: TextStyle(
          decoration: log.isConfirmed ? null : TextDecoration.lineThrough,
        ),
      ),
      subtitle: Text(
        [
          if (log.studentIdCode != null) log.studentIdCode!,
          log.sessionLabel ?? 'Session #${log.sessionWindowId}',
          Fmt.dateTime(log.scannedAt),
          if (!log.isConfirmed) 'CANCELLED',
          if (log.scannedByName != null) 'by ${log.scannedByName}',
          if (log.eventName != null) log.eventName!,
        ].join(' · '),
      ),
      isThreeLine: true,
      trailing: PopupMenuButton<String>(
        onSelected: (v) => v == 'edit' ? onEdit() : onDelete(),
        itemBuilder: (_) => const [
          PopupMenuItem(value: 'edit', child: Text('Edit')),
          PopupMenuItem(value: 'delete', child: Text('Delete')),
        ],
      ),
      onTap: onEdit,
    );
  }
}
