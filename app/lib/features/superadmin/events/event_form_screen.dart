import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/repositories.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../models/event_model.dart';
import '../../../widgets/async_value_widget.dart';
import '../../../widgets/error_banner.dart';
import '../../../widgets/section_header.dart';
import '../admin_providers.dart';
import 'session_window_editor.dart';

/// Create or edit an event and its session windows.
///
/// New event: windows are sent together with the event in one request.
/// Existing event: window changes are saved immediately, one by one.
class EventFormScreen extends ConsumerStatefulWidget {
  const EventFormScreen({super.key, this.existing});
  final EventModel? existing;

  @override
  ConsumerState<EventFormScreen> createState() => _EventFormScreenState();
}

class _EventFormScreenState extends ConsumerState<EventFormScreen> {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.existing?.name ?? '');
  late DateTime _date = _clampToTodayOrLater(
    widget.existing?.eventDate ?? DateTime.now(),
  );
  late bool _active = widget.existing?.isActive ?? true;
  late final List<WindowDraft> _windows = widget.existing == null
      ? WindowDraft.defaults()
      : widget.existing!.sessionWindows.map(WindowDraft.fromModel).toList();
  bool _busy = false;

  bool get isEdit => widget.existing != null;
  int? get eventId => widget.existing?.id;

  static DateTime get _today {
    final n = DateTime.now();
    return DateTime(n.year, n.month, n.day);
  }

  /// Past calendar days are invalid for event dates.
  static DateTime _clampToTodayOrLater(DateTime d) {
    final day = DateTime(d.year, d.month, d.day);
    final today = _today;
    return day.isBefore(today) ? today : day;
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final today = _today;
    final picked = await showDatePicker(
      context: context,
      initialDate: _clampToTodayOrLater(_date),
      firstDate: today,
      lastDate: DateTime(2100),
      helpText: 'Select event date',
      selectableDayPredicate: (day) =>
          !DateTime(day.year, day.month, day.day).isBefore(today),
    );
    if (picked != null) setState(() => _date = _clampToTodayOrLater(picked));
  }

  // ---- windows -------------------------------------------------------------

  Future<void> _addWindow() async {
    final draft = await showWindowDialog(context);
    if (draft == null) return;
    final err = validateWindows([..._windows, draft]);
    if (err != null) {
      if (mounted) showSnack(context, err);
      return;
    }
    if (isEdit) {
      await _guard(() async {
        final created = await ref
            .read(adminRepositoryProvider)
            .createSessionWindow(
              eventId!,
              label: draft.label,
              start: draft.start,
              end: draft.end,
            );
        setState(() => _windows.add(WindowDraft.fromModel(created)));
      });
    } else {
      setState(() => _windows.add(draft));
    }
  }

  Future<void> _editWindow(int index) async {
    final current = _windows[index];
    final draft = await showWindowDialog(context, existing: current);
    if (draft == null) return;
    final candidate = [..._windows]..[index] = draft;
    final err = validateWindows(candidate);
    if (err != null) {
      if (mounted) showSnack(context, err);
      return;
    }
    if (isEdit && current.id != null) {
      await _guard(() async {
        final updated = await ref
            .read(adminRepositoryProvider)
            .updateSessionWindow(
              current.id!,
              label: draft.label,
              start: draft.start,
              end: draft.end,
            );
        setState(() => _windows[index] = WindowDraft.fromModel(updated));
      });
    } else {
      setState(() => _windows[index] = draft);
    }
  }

  Future<void> _removeWindow(int index) async {
    final w = _windows[index];
    if (isEdit && w.id != null) {
      final ok = await confirmDialog(
        context,
        title: 'Delete "${w.label}"?',
        message: 'Attendance recorded under this session will be deleted too.',
      );
      if (!ok) return;
      await _guard(() async {
        final repo = ref.read(adminRepositoryProvider);
        try {
          await repo.deleteSessionWindow(w.id!);
        } on ApiFailure catch (e) {
          if (e.code == 'HAS_RECORDS') {
            await repo.deleteSessionWindow(w.id!, force: true);
          } else {
            rethrow;
          }
        }
        setState(() => _windows.removeAt(index));
      });
    } else {
      setState(() => _windows.removeAt(index));
    }
  }

  Future<void> _guard(Future<void> Function() fn) async {
    setState(() => _busy = true);
    try {
      await fn();
      _invalidate();
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _invalidate() {
    ref.invalidate(eventsProvider);
    if (eventId != null) ref.invalidate(eventDetailProvider(eventId!));
  }

  // ---- save ----------------------------------------------------------------

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    final day = DateTime(_date.year, _date.month, _date.day);
    if (day.isBefore(_today)) {
      showSnack(context, 'Event date cannot be in the past');
      setState(() => _date = _today);
      return;
    }
    final err = validateWindows(_windows);
    if (err != null) {
      showSnack(context, err);
      return;
    }
    if (_windows.isEmpty) {
      final ok = await confirmDialog(
        context,
        title: 'No session windows',
        message:
            'Moderators cannot scan for an event without at least one '
            'session window. Save anyway?',
        confirmLabel: 'Save anyway',
        destructive: false,
      );
      if (!ok) return;
    }
    setState(() => _busy = true);
    final repo = ref.read(adminRepositoryProvider);
    try {
      if (isEdit) {
        await repo.updateEvent(
          eventId!,
          name: _name.text.trim(),
          eventDate: _date,
          isActive: _active,
        );
      } else {
        await repo.createEvent(
          name: _name.text.trim(),
          eventDate: _date,
          isActive: _active,
          windows: [
            for (final w in _windows)
              (label: w.label, start: w.start, end: w.end),
          ],
        );
      }
      _invalidate();
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: Text(isEdit ? 'Edit event' : 'New event')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: AppTheme.formMaxWidth),
          child: Form(
            key: _form,
            child: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                TextFormField(
                  controller: _name,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(
                    labelText: 'Event name *',
                    hintText: 'Founders Day 2026',
                    prefixIcon: Icon(Icons.event),
                  ),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? 'Required' : null,
                ),
                const SizedBox(height: 14),
                ListTile(
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppTheme.radius),
                    side: BorderSide(color: scheme.outlineVariant),
                  ),
                  leading: const Icon(Icons.calendar_today),
                  title: const Text('Event date'),
                  subtitle: Text(Fmt.weekday(_date)),
                  trailing: const Icon(Icons.edit_calendar),
                  onTap: _pickDate,
                ),
                const SizedBox(height: 8),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Active'),
                  subtitle: const Text(
                    'Moderators can only scan for active events',
                  ),
                  value: _active,
                  onChanged: (v) => setState(() => _active = v),
                ),
                const Divider(height: 36),
                SectionHeader(
                  title: 'Session windows',
                  subtitle:
                      'Scans go to the open session. First scan = IN, second = OUT. '
                      'Ranges must not overlap.',
                  trailing: TextButton.icon(
                    onPressed: _busy ? null : _addWindow,
                    icon: const Icon(Icons.add),
                    label: const Text('Add'),
                  ),
                ),
                if (_windows.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    child: Center(
                      child: Text(
                        'No sessions yet — add Morning / Afternoon.',
                        style: TextStyle(color: scheme.error),
                      ),
                    ),
                  ),
                for (var i = 0; i < _windows.length; i++)
                  Card(
                    child: ListTile(
                      leading: CircleAvatar(
                        backgroundColor: scheme.primaryContainer,
                        foregroundColor: scheme.onPrimaryContainer,
                        child: Text('${i + 1}'),
                      ),
                      title: Text(_windows[i].label),
                      subtitle: Text(
                        Fmt.hhmmRange(_windows[i].start, _windows[i].end),
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(
                            icon: const Icon(Icons.edit_outlined),
                            onPressed: _busy ? null : () => _editWindow(i),
                          ),
                          IconButton(
                            icon: const Icon(Icons.delete_outline),
                            onPressed: _busy ? null : () => _removeWindow(i),
                          ),
                        ],
                      ),
                    ),
                  ),
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: _busy ? null : _save,
                  icon: const Icon(Icons.save),
                  label: Text(isEdit ? 'Save event' : 'Create event'),
                ),
                if (isEdit)
                  Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: Text(
                      'Session window changes are saved immediately.',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: scheme.outline,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
