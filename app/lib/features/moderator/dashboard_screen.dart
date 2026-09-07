import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/config/server_settings.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../models/event_model.dart';
import '../../widgets/async_value_widget.dart';
import '../../widgets/section_header.dart';
import '../../widgets/status_chip.dart';
import '../auth/server_config_screen.dart';
import '../superadmin/events/session_window_editor.dart';
import 'moderator_providers.dart';
import 'my_scans_history_screen.dart';
import 'scanner_screen.dart';
import 'session_override_widget.dart';

class ModeratorDashboardScreen extends ConsumerWidget {
  const ModeratorDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final server = ref.watch(serverSettingsProvider).value;
    final events = ref.watch(activeEventsProvider);
    final selected = ref.watch(selectedEventProvider);
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Moderator'),
        actions: [
          IconButton(
            tooltip: 'Refresh events',
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(activeEventsProvider),
          ),
          IconButton(
            tooltip: 'Server settings',
            icon: const Icon(Icons.settings_ethernet),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => const ServerConfigScreen(canPop: true),
              ),
            ),
          ),
          IconButton(
            tooltip: 'Sign out',
            icon: const Icon(Icons.logout),
            onPressed: () async {
              final ok = await confirmDialog(
                context,
                title: 'Sign out?',
                message: 'You will need to log in again.',
                confirmLabel: 'Sign out',
                destructive: false,
              );
              if (ok) await ref.read(authProvider.notifier).signOut();
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(activeEventsProvider.future),
        child: ListView(
          padding: AppTheme.pagePadding,
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 24,
                      backgroundColor: scheme.primaryContainer,
                      foregroundColor: scheme.onPrimaryContainer,
                      child: Text(
                        (user?.name.isNotEmpty ?? false)
                            ? user!.name[0].toUpperCase()
                            : 'M',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Hi, ${user?.name ?? 'Moderator'}',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          Text(
                            server?.display ?? 'Server not set',
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(color: scheme.onSurfaceVariant),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            const SectionHeader(
              title: 'Event',
              subtitle: 'Choose the event you are scanning for',
            ),
            AsyncValueWidget(
              value: events,
              onRetry: () => ref.invalidate(activeEventsProvider),
              data: (list) {
                if (list.isEmpty) {
                  return Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(
                        'No active events. Ask the superadmin to create one '
                        'and mark it active.',
                        style: TextStyle(color: scheme.error),
                      ),
                    ),
                  );
                }
                return Column(
                  children: [
                    if (list.length > 1)
                      DropdownButtonFormField<int>(
                        initialValue: selected?.id,
                        isExpanded: true,
                        decoration: const InputDecoration(
                          labelText: 'Select event',
                        ),
                        items: [
                          for (final e in list)
                            DropdownMenuItem(
                              value: e.id,
                              child: Text(
                                '${e.name} · ${Fmt.dateShort(e.eventDate)}'
                                '${e.isToday ? ' (today)' : ''}',
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                        ],
                        onChanged: (id) {
                          final e = list.where((x) => x.id == id).firstOrNull;
                          if (e != null) {
                            ref.read(selectedEventProvider.notifier).select(e);
                          }
                        },
                      ),
                    if (selected != null) ...[
                      if (list.length > 1) const SizedBox(height: 10),
                      _EventCard(event: selected),
                    ],
                  ],
                );
              },
            ),
            if (selected != null) ...[
              const SizedBox(height: 20),
              const SectionHeader(
                title: 'Session for next scans',
                subtitle: 'Auto uses the open window, or pick one manually',
              ),
              SessionOverrideWidget(event: selected),
              const SizedBox(height: 24),
              FilledButton.icon(
                style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(64),
                ),
                onPressed: selected.sessionWindows.isEmpty
                    ? null
                    : () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => ScannerScreen(event: selected),
                        ),
                      ),
                icon: const Icon(Icons.qr_code_scanner, size: 32),
                label: const Text(
                  'Start scanning',
                  style: TextStyle(fontSize: 20),
                ),
              ),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const MyScansHistoryScreen(),
                  ),
                ),
                icon: const Icon(Icons.history),
                label: const Text('My scans today'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _EventCard extends StatelessWidget {
  const _EventCard({required this.event});
  final EventModel event;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      color: scheme.primaryContainer,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    event.name,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      color: scheme.onPrimaryContainer,
                    ),
                  ),
                ),
                if (event.isToday) StatusChip.today(),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              Fmt.weekday(event.eventDate),
              style: TextStyle(
                color: scheme.onPrimaryContainer.withValues(alpha: 0.9),
              ),
            ),
            const SizedBox(height: 12),
            SessionWindowChips(
              windows: event.sessionWindows,
              highlightId: event.currentSessionWindowId,
            ),
          ],
        ),
      ),
    );
  }
}
