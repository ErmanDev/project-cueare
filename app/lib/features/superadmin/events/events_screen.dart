import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/repositories.dart';
import '../../../core/utils/formatters.dart';
import '../../../models/event_model.dart';
import '../../../widgets/async_value_widget.dart';
import '../../../widgets/error_banner.dart';
import '../../../widgets/page_scaffold.dart';
import '../../../widgets/status_chip.dart';
import '../admin_providers.dart';
import '../attendance/attendance_screen.dart';
import 'event_form_screen.dart';
import 'event_roster_screen.dart';
import 'session_window_editor.dart';

class EventsScreen extends ConsumerWidget {
  const EventsScreen({super.key});

  void _open(BuildContext context, Widget screen) => Navigator.of(
    context,
  ).push(MaterialPageRoute<void>(builder: (_) => screen));

  Future<void> _toggleActive(
    BuildContext context,
    WidgetRef ref,
    EventModel e,
  ) async {
    try {
      await ref
          .read(adminRepositoryProvider)
          .updateEvent(e.id, isActive: !e.isActive);
      ref.invalidate(eventsProvider);
    } catch (err) {
      if (context.mounted) showErrorSnack(context, err);
    }
  }

  Future<void> _syncRoster(
    BuildContext context,
    WidgetRef ref,
    EventModel e,
  ) async {
    try {
      final count = await ref
          .read(adminRepositoryProvider)
          .syncEventRoster(e.id);
      ref.invalidate(eventsProvider);
      if (context.mounted) {
        showSnack(context, 'Synced roster · $count participants');
      }
    } catch (err) {
      if (context.mounted) showErrorSnack(context, err);
    }
  }

  Future<void> _delete(
    BuildContext context,
    WidgetRef ref,
    EventModel e,
  ) async {
    final ok = await confirmDialog(
      context,
      title: 'Delete "${e.name}"?',
      message:
          'All session windows and attendance records for this event will '
          'be permanently deleted.',
    );
    if (!ok) return;
    try {
      await ref.read(adminRepositoryProvider).deleteEvent(e.id);
      ref.invalidate(eventsProvider);
      if (context.mounted) showSnack(context, 'Event deleted');
    } catch (err) {
      if (context.mounted) showErrorSnack(context, err);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final events = ref.watch(eventsProvider);
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(title: const Text('Events')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _open(context, const EventFormScreen()),
        icon: const Icon(Icons.add),
        label: const Text('New event'),
      ),
      body: AppContentWidth(
        child: RefreshIndicator(
        onRefresh: () => ref.refresh(eventsProvider.future),
        child: AsyncValueWidget(
          value: events,
          onRetry: () => ref.invalidate(eventsProvider),
          data: (list) {
            if (list.isEmpty) {
              return const EmptyState(
                icon: Icons.event_busy,
                title: 'No events yet',
                subtitle:
                    'Create an event and define its Morning / Afternoon sessions.',
              );
            }
            return ListView.builder(
              padding: AppListPadding.standard,
              itemCount: list.length,
              itemBuilder: (context, i) {
                final e = list[i];
                final today = _isToday(e.eventDate);
                return Card(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 14, 8, 14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    e.name,
                                    style: Theme.of(
                                      context,
                                    ).textTheme.titleMedium,
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    Fmt.weekday(e.eventDate),
                                    style: TextStyle(
                                      color: today
                                          ? scheme.primary
                                          : scheme.onSurfaceVariant,
                                      fontWeight: today
                                          ? FontWeight.w600
                                          : FontWeight.w400,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            if (today) ...[
                              StatusChip.today(),
                              const SizedBox(width: 6),
                            ],
                            if (e.isExpired) ...[
                              StatusChip.expired(),
                              const SizedBox(width: 6),
                            ],
                            StatusChip.active(e.isActive),
                            PopupMenuButton<String>(
                              onSelected: (v) {
                                switch (v) {
                                  case 'edit':
                                    _open(
                                      context,
                                      EventFormScreen(existing: e),
                                    );
                                  case 'roster':
                                    _open(context, EventRosterScreen(event: e));
                                  case 'sync':
                                    _syncRoster(context, ref, e);
                                  case 'toggle':
                                    _toggleActive(context, ref, e);
                                  case 'attendance':
                                    ref
                                        .read(attendanceFilterProvider.notifier)
                                        .set(
                                          AttendanceQuery(
                                            eventId: e.id,
                                            limit: 500,
                                          ),
                                        );
                                    _open(context, const AttendanceScreen());
                                  case 'delete':
                                    _delete(context, ref, e);
                                }
                              },
                              itemBuilder: (_) => [
                                const PopupMenuItem(
                                  value: 'edit',
                                  child: Text('Edit event & sessions'),
                                ),
                                const PopupMenuItem(
                                  value: 'roster',
                                  child: Text('Manage roster'),
                                ),
                                const PopupMenuItem(
                                  value: 'sync',
                                  child: Text('Sync roster'),
                                ),
                                PopupMenuItem(
                                  value: 'toggle',
                                  child: Text(
                                    e.isActive
                                        ? 'Mark inactive'
                                        : 'Mark active',
                                  ),
                                ),
                                const PopupMenuItem(
                                  value: 'attendance',
                                  child: Text('View attendance'),
                                ),
                                const PopupMenuItem(
                                  value: 'delete',
                                  child: Text('Delete'),
                                ),
                              ],
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        SessionWindowChips(windows: e.sessionWindows),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Icon(
                              Icons.groups_outlined,
                              size: 16,
                              color: scheme.onSurfaceVariant,
                            ),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                '${e.participantCount} participant'
                                '${e.participantCount == 1 ? '' : 's'}',
                                style: Theme.of(context).textTheme.bodySmall
                                    ?.copyWith(color: scheme.onSurfaceVariant),
                              ),
                            ),
                            TextButton(
                              onPressed: () => _open(
                                context,
                                EventRosterScreen(event: e),
                              ),
                              child: const Text('Roster'),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              },
            );
          },
        ),
        ),
      ),
    );
  }

  static bool _isToday(DateTime d) {
    final n = DateTime.now();
    return d.year == n.year && d.month == n.month && d.day == n.day;
  }
}
