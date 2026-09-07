import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/repositories.dart';
import '../../../core/utils/formatters.dart';
import '../../../models/attendance_log_model.dart';
import '../../../models/session_window_model.dart';
import '../../../widgets/error_banner.dart';
import '../admin_providers.dart';

/// Manual correction of a single attendance row.
class AttendanceEditDialog extends ConsumerStatefulWidget {
  const AttendanceEditDialog({super.key, required this.log});
  final AttendanceLogModel log;

  static Future<bool?> show(BuildContext context, AttendanceLogModel log) =>
      showDialog<bool>(
        context: context,
        builder: (_) => AttendanceEditDialog(log: log),
      );

  @override
  ConsumerState<AttendanceEditDialog> createState() =>
      _AttendanceEditDialogState();
}

class _AttendanceEditDialogState extends ConsumerState<AttendanceEditDialog> {
  late String _direction = widget.log.direction;
  late String _status = widget.log.status;
  late int _windowId = widget.log.sessionWindowId;
  late DateTime _scannedAt = widget.log.scannedAt;
  late final _note = TextEditingController(text: widget.log.deviceNote ?? '');
  bool _busy = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _pickTime() async {
    final t = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_scannedAt),
    );
    if (t == null) return;
    setState(() {
      _scannedAt = DateTime(
        _scannedAt.year,
        _scannedAt.month,
        _scannedAt.day,
        t.hour,
        t.minute,
      );
    });
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      await ref
          .read(adminRepositoryProvider)
          .updateAttendance(
            widget.log.id,
            direction: _direction,
            status: _status,
            sessionWindowId: _windowId,
            scannedAt: _scannedAt,
            deviceNote: _note.text.trim(),
          );
      ref.invalidate(attendanceListProvider);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final event = ref.watch(eventDetailProvider(widget.log.eventId));
    final windows = event.value?.sessionWindows ?? const <SessionWindowModel>[];
    final log = widget.log;

    return AlertDialog(
      title: const Text('Edit attendance record'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              log.studentName ?? 'Student #${log.studentId}',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            Text(
              log.studentIdCode ?? '',
              style: TextStyle(color: Theme.of(context).colorScheme.outline),
            ),
            const SizedBox(height: 16),
            const Text('Direction'),
            const SizedBox(height: 4),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(
                  value: 'IN',
                  label: Text('IN'),
                  icon: Icon(Icons.login),
                ),
                ButtonSegment(
                  value: 'OUT',
                  label: Text('OUT'),
                  icon: Icon(Icons.logout),
                ),
              ],
              selected: {_direction},
              onSelectionChanged: (s) => setState(() => _direction = s.first),
            ),
            const SizedBox(height: 16),
            const Text('Status'),
            const SizedBox(height: 4),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'confirmed', label: Text('Confirmed')),
                ButtonSegment(value: 'cancelled', label: Text('Cancelled')),
              ],
              selected: {_status},
              onSelectionChanged: (s) => setState(() => _status = s.first),
            ),
            const SizedBox(height: 16),
            if (windows.isNotEmpty)
              DropdownButtonFormField<int>(
                initialValue: windows.any((w) => w.id == _windowId)
                    ? _windowId
                    : null,
                decoration: const InputDecoration(labelText: 'Session'),
                items: [
                  for (final w in windows)
                    DropdownMenuItem(
                      value: w.id,
                      child: Text(
                        '${w.sessionLabel} (${Fmt.hhmmRange(w.startTime, w.endTime)})',
                      ),
                    ),
                ],
                onChanged: (v) => setState(() => _windowId = v ?? _windowId),
              )
            else
              Text('Session: ${log.sessionLabel ?? '#${log.sessionWindowId}'}'),
            const SizedBox(height: 12),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.access_time),
              title: const Text('Scanned at'),
              subtitle: Text(Fmt.dateTime(_scannedAt)),
              trailing: const Icon(Icons.edit),
              onTap: _pickTime,
            ),
            TextField(
              controller: _note,
              decoration: const InputDecoration(
                labelText: 'Note (reason for correction)',
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : () => Navigator.pop(context, false),
          child: const Text('Cancel'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
          onPressed: _busy ? null : _save,
          child: const Text('Save'),
        ),
      ],
    );
  }
}
