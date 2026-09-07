import 'package:flutter/material.dart';

import '../../../core/utils/formatters.dart';
import '../../../models/session_window_model.dart';

/// A pending or saved session window row in the editor.
class WindowDraft {
  WindowDraft({
    this.id,
    required this.label,
    required this.start,
    required this.end,
  });

  final int? id; // null = not yet saved on the server
  String label;
  String start; // HH:mm
  String end;

  factory WindowDraft.fromModel(SessionWindowModel m) => WindowDraft(
    id: m.id,
    label: m.sessionLabel,
    start: m.startTime,
    end: m.endTime,
  );

  static List<WindowDraft> defaults() => [
    WindowDraft(label: 'Morning', start: '07:00', end: '12:00'),
    WindowDraft(label: 'Afternoon', start: '13:00', end: '17:00'),
  ];
}

String _hhmm(TimeOfDay t) =>
    '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

TimeOfDay _parse(String hhmm) {
  final p = hhmm.split(':');
  return TimeOfDay(
    hour: int.tryParse(p[0]) ?? 0,
    minute: int.tryParse(p[1]) ?? 0,
  );
}

int _minutes(String hhmm) {
  final t = _parse(hhmm);
  return t.hour * 60 + t.minute;
}

/// Client-side validation mirroring the server: HH:mm, start < end,
/// no overlaps. Returns an error message or null.
String? validateWindows(List<WindowDraft> windows) {
  for (final w in windows) {
    if (w.label.trim().isEmpty) return 'Every session needs a label';
    if (_minutes(w.start) >= _minutes(w.end)) {
      return '"${w.label}": start time must be before end time';
    }
  }
  for (var i = 0; i < windows.length; i++) {
    for (var j = i + 1; j < windows.length; j++) {
      final a = windows[i];
      final b = windows[j];
      if (_minutes(a.start) < _minutes(b.end) &&
          _minutes(b.start) < _minutes(a.end)) {
        return '"${a.label}" overlaps "${b.label}"';
      }
    }
  }
  return null;
}

/// Dialog to add/edit a single window. Returns the edited draft or null.
Future<WindowDraft?> showWindowDialog(
  BuildContext context, {
  WindowDraft? existing,
}) {
  return showDialog<WindowDraft>(
    context: context,
    builder: (_) => _WindowDialog(existing: existing),
  );
}

class _WindowDialog extends StatefulWidget {
  const _WindowDialog({this.existing});
  final WindowDraft? existing;

  @override
  State<_WindowDialog> createState() => _WindowDialogState();
}

class _WindowDialogState extends State<_WindowDialog> {
  late final _label = TextEditingController(text: widget.existing?.label ?? '');
  late String _start = widget.existing?.start ?? '07:00';
  late String _end = widget.existing?.end ?? '12:00';
  String? _error;

  @override
  void dispose() {
    _label.dispose();
    super.dispose();
  }

  Future<void> _pick(bool isStart) async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _parse(isStart ? _start : _end),
    );
    if (picked == null) return;
    setState(() {
      if (isStart) {
        _start = _hhmm(picked);
      } else {
        _end = _hhmm(picked);
      }
      _error = null;
    });
  }

  void _save() {
    final draft = WindowDraft(
      id: widget.existing?.id,
      label: _label.text.trim(),
      start: _start,
      end: _end,
    );
    final err = validateWindows([draft]);
    if (err != null) {
      setState(() => _error = err);
      return;
    }
    Navigator.pop(context, draft);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.existing == null ? 'Add session' : 'Edit session'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _label,
            autofocus: widget.existing == null,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(
              labelText: 'Label',
              hintText: 'Morning / Afternoon / Evening',
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _TimeButton(
                  label: 'Start',
                  value: _start,
                  onTap: () => _pick(true),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _TimeButton(
                  label: 'End',
                  value: _end,
                  onTap: () => _pick(false),
                ),
              ),
            ],
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
          onPressed: _save,
          child: const Text('OK'),
        ),
      ],
    );
  }
}

class _TimeButton extends StatelessWidget {
  const _TimeButton({
    required this.label,
    required this.value,
    required this.onTap,
  });
  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: onTap,
      style: OutlinedButton.styleFrom(
        padding: const EdgeInsets.symmetric(vertical: 12),
      ),
      child: Column(
        children: [
          Text(label, style: Theme.of(context).textTheme.labelSmall),
          Text(Fmt.hhmm(value), style: Theme.of(context).textTheme.titleMedium),
        ],
      ),
    );
  }
}

/// Read-only chip list of windows used in event cards.
class SessionWindowChips extends StatelessWidget {
  const SessionWindowChips({
    super.key,
    required this.windows,
    this.highlightId,
  });
  final List<SessionWindowModel> windows;
  final int? highlightId;

  @override
  Widget build(BuildContext context) {
    if (windows.isEmpty) {
      return Text(
        'No session windows',
        style: TextStyle(color: Theme.of(context).colorScheme.error),
      );
    }
    return Wrap(
      spacing: 6,
      runSpacing: 4,
      children: [
        for (final w in windows)
          Chip(
            visualDensity: VisualDensity.compact,
            avatar: w.id == highlightId
                ? const Icon(Icons.schedule, size: 16)
                : null,
            label: Text(
              '${w.sessionLabel} ${Fmt.hhmmRange(w.startTime, w.endTime)}',
            ),
            backgroundColor: w.id == highlightId
                ? Theme.of(context).colorScheme.primaryContainer
                : null,
          ),
      ],
    );
  }
}
