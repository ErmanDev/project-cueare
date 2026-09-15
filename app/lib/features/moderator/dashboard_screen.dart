import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../models/event_model.dart';
import '../../widgets/async_value_widget.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/section_header.dart';
import '../../widgets/status_chip.dart';
import '../superadmin/events/session_window_editor.dart';
import 'moderator_providers.dart';
import 'my_scans_history_screen.dart';
import 'scanner_screen.dart';
import 'session_override_widget.dart';

class ModeratorDashboardScreen extends ConsumerStatefulWidget {
  const ModeratorDashboardScreen({super.key});

  @override
  ConsumerState<ModeratorDashboardScreen> createState() =>
      _ModeratorDashboardScreenState();
}

class _ModeratorDashboardScreenState
    extends ConsumerState<ModeratorDashboardScreen> {
  int _index = 0;

  Future<void> _signOut() async {
    final ok = await confirmDialog(
      context,
      title: 'Sign out?',
      message: 'You will need to log in again.',
      confirmLabel: 'Sign out',
      destructive: false,
    );
    if (ok && mounted) await ref.read(authProvider.notifier).signOut();
  }

  @override
  Widget build(BuildContext context) {
    final selected = ref.watch(selectedEventProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(switch (_index) {
          0 => 'Moderator',
          1 => selected?.name ?? 'Scan',
          _ => 'My scans today',
        }),
        actions: [
          if (_index == 0)
            IconButton(
              tooltip: 'Refresh events',
              icon: const Icon(Icons.refresh),
              onPressed: () => ref.invalidate(activeEventsProvider),
            ),
          if (_index == 2)
            IconButton(
              tooltip: 'Refresh scans',
              icon: const Icon(Icons.refresh),
              onPressed: () => ref.invalidate(myScansProvider),
            ),
          IconButton(
            tooltip: 'Sign out',
            icon: const Icon(Icons.logout),
            onPressed: _signOut,
          ),
        ],
      ),
      body: switch (_index) {
        0 => const _ModeratorEventTab(),
        1 => _ModeratorScanTab(
          event: selected,
          onChooseEvent: () => setState(() => _index = 0),
        ),
        _ => const MyScansHistoryScreen(embedded: true),
      },
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.event_outlined),
            selectedIcon: Icon(Icons.event),
            label: 'Event',
          ),
          NavigationDestination(
            icon: Icon(Icons.qr_code_scanner),
            selectedIcon: Icon(Icons.qr_code_scanner),
            label: 'Scan',
          ),
          NavigationDestination(
            icon: Icon(Icons.history_outlined),
            selectedIcon: Icon(Icons.history),
            label: 'My scans',
          ),
        ],
      ),
    );
  }
}

class _ModeratorEventTab extends ConsumerWidget {
  const _ModeratorEventTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final events = ref.watch(activeEventsProvider);
    final selected = ref.watch(selectedEventProvider);
    final eventList = events.asData?.value;
    final noEvents = eventList != null && eventList.isEmpty;
    final hello = _HelloCard(name: user?.name, username: user?.username);

    return AppContentWidth(
      child: RefreshIndicator(
        onRefresh: () => ref.refresh(activeEventsProvider.future),
        child: noEvents
            ? CustomScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                slivers: [
                  SliverPadding(
                    padding: AppTheme.pagePadding,
                    sliver: SliverToBoxAdapter(child: hello),
                  ),
                  const SliverFillRemaining(
                    hasScrollBody: false,
                    child: EmptyState(
                      icon: Icons.event_busy,
                      title: 'No active events.',
                    ),
                  ),
                ],
              )
            : ListView(
                padding: AppTheme.pagePadding,
                children: [
                  hello,
                  const SizedBox(height: 16),
                  const SectionHeader(
                    title: 'Event',
                    subtitle: 'Choose the event you are scanning for',
                  ),
                  AsyncValueWidget(
                    value: events,
                    onRetry: () => ref.invalidate(activeEventsProvider),
                    data: (list) {
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
                                final e = list
                                    .where((x) => x.id == id)
                                    .firstOrNull;
                                if (e != null) {
                                  ref
                                      .read(selectedEventProvider.notifier)
                                      .select(e);
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
                      subtitle:
                          'Auto uses the open window, or pick one manually',
                    ),
                    SessionOverrideWidget(event: selected),
                  ],
                ],
              ),
      ),
    );
  }
}

class _ModeratorScanTab extends StatelessWidget {
  const _ModeratorScanTab({required this.event, required this.onChooseEvent});

  final EventModel? event;
  final VoidCallback onChooseEvent;

  @override
  Widget build(BuildContext context) {
    if (event == null || event!.sessionWindows.isEmpty) {
      return EmptyState(
        icon: Icons.qr_code_scanner,
        title: event == null
            ? 'Choose an event first'
            : 'This event has no sessions',
        subtitle: 'Pick an event with a session window, then scan.',
        action: FilledButton(
          onPressed: onChooseEvent,
          child: const Text('Choose event'),
        ),
      );
    }
    return ScannerScreen(
      key: ValueKey(event!.id),
      event: event!,
      embedded: true,
    );
  }
}

class _HelloCard extends StatelessWidget {
  const _HelloCard({this.name, this.username});

  final String? name;
  final String? username;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            CircleAvatar(
              radius: 24,
              backgroundColor: scheme.primaryContainer,
              foregroundColor: scheme.onPrimaryContainer,
              child: Text(
                (name?.isNotEmpty ?? false) ? name![0].toUpperCase() : 'M',
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Hi, ${name ?? 'Moderator'}',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  Text(
                    username != null ? '@$username' : 'ACSSCO Bukidnon',
                    style: Theme.of(context).textTheme.bodySmall
                        ?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                ],
              ),
            ),
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
