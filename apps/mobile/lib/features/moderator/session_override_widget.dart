import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/utils/formatters.dart';
import '../../models/event_model.dart';
import 'moderator_providers.dart';

/// [Auto | Morning | Afternoon | …] — lets the moderator force which session
/// the next scans belong to. Auto = server decides from its clock.
class SessionOverrideWidget extends ConsumerWidget {
  const SessionOverrideWidget({
    super.key,
    required this.event,
    this.dense = false,
  });
  final EventModel event;
  final bool dense;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final override = ref.watch(sessionOverrideProvider);
    final scheme = Theme.of(context).colorScheme;
    final windows = event.sessionWindows;

    if (windows.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(8),
        child: Text(
          'This event has no session windows — ask the superadmin to add them.',
          style: TextStyle(color: scheme.error),
        ),
      );
    }

    final selectedWindow = override == null
        ? null
        : windows.where((w) => w.id == override).firstOrNull;
    final autoWindow = windows
        .where((w) => w.id == event.currentSessionWindowId)
        .firstOrNull;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: SegmentedButton<int>(
            showSelectedIcon: false,
            style: dense
                ? const ButtonStyle(visualDensity: VisualDensity.compact)
                : null,
            segments: [
              const ButtonSegment(
                value: -1,
                label: Text('Auto'),
                icon: Icon(Icons.schedule),
              ),
              for (final w in windows)
                ButtonSegment(value: w.id, label: Text(w.sessionLabel)),
            ],
            selected: {override ?? -1},
            onSelectionChanged: (s) {
              final v = s.first;
              ref
                  .read(sessionOverrideProvider.notifier)
                  .set(v == -1 ? null : v);
            },
          ),
        ),
        const SizedBox(height: 4),
        Text(
          override == null
              ? (autoWindow == null
                    ? 'Auto: no session is open right now — pick one manually.'
                    : 'Auto: ${autoWindow.sessionLabel} (${Fmt.hhmmRange(autoWindow.startTime, autoWindow.endTime)})')
              : 'Manual: all scans will count for ${selectedWindow?.sessionLabel ?? ''}',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 12,
            color: override == null && autoWindow == null
                ? scheme.error
                : scheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}
