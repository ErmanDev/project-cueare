import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/utils/formatters.dart';
import '../../models/student_event_model.dart';
import '../../widgets/async_value_widget.dart';
import '../../widgets/error_banner.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/status_chip.dart';
import 'event_qr_screen.dart';
import 'student_providers.dart';
import 'student_self_scanner_screen.dart';

class MyQrScreen extends ConsumerWidget {
  const MyQrScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final events = ref.watch(myEventsProvider);

    return RefreshIndicator(
      onRefresh: () => ref.refresh(myEventsProvider.future),
      child: AsyncValueWidget(
        value: events,
        onRetry: () => ref.invalidate(myEventsProvider),
        loadingMessage: 'Loading your events…',
        data: (list) {
          if (list.isEmpty) {
            return const EmptyState(
              icon: Icons.event_busy_outlined,
              title: 'No events yet',
              subtitle:
                  'When a moderator or admin adds you to an event, it will show here.',
            );
          }
          return ListView(
            padding: AppListPadding.standard,
            children: [
              Card(
                color: Theme.of(context).colorScheme.primaryContainer,
                child: InkWell(
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => const StudentSelfScannerScreen(),
                      ),
                    );
                  },
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      children: [
                        Icon(
                          Icons.qr_code_scanner,
                          size: 32,
                          color: Theme.of(context).colorScheme.onPrimaryContainer,
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Scan Venue QR',
                                style: Theme.of(context)
                                    .textTheme
                                    .titleMedium
                                    ?.copyWith(
                                      fontWeight: FontWeight.bold,
                                      color: Theme.of(context)
                                          .colorScheme
                                          .onPrimaryContainer,
                                    ),
                              ),
                              Text(
                                'Point camera at event screen token',
                                style: Theme.of(context)
                                    .textTheme
                                    .bodySmall
                                    ?.copyWith(
                                      color: Theme.of(context)
                                          .colorScheme
                                          .onPrimaryContainer
                                          .withValues(alpha: 0.8),
                                    ),
                              ),
                            ],
                          ),
                        ),
                        Icon(
                          Icons.chevron_right,
                          color: Theme.of(context).colorScheme.onPrimaryContainer,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              for (int i = 0; i < list.length; i++) ...[
                if (i > 0) const SizedBox(height: 8),
                _EventCard(event: list[i]),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _EventCard extends ConsumerWidget {
  const _EventCard({required this.event});
  final StudentEventModel event;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final text = Theme.of(context).textTheme;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => _open(context, ref),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(event.name, style: text.titleMedium),
                  ),
                  if (event.canShowQr)
                    StatusChip.active(true)
                  else if (event.isExpired)
                    StatusChip.expired()
                  else
                    StatusChip.active(false),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                Fmt.weekday(event.eventDate.toLocal()),
                style: text.bodySmall,
              ),
              if (event.sessions.isNotEmpty) ...[
                const SizedBox(height: 12),
                for (final session in event.sessions)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      children: [
                        session.scanLabel == 'Pending'
                            ? const StatusChip(label: 'Pending')
                            : StatusChip.direction(session.scanLabel),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(session.sessionName, style: text.bodyMedium),
                        ),
                        if (session.scanTime != null)
                          Text(session.scanTime!, style: text.labelLarge),
                      ],
                    ),
                  ),
              ],
              if (event.canShowQr) ...[
                const SizedBox(height: 4),
                Text(
                  'Tap to show your QR for this event',
                  style: text.bodySmall,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _open(BuildContext context, WidgetRef ref) async {
    if (!event.canShowQr) {
      showSnack(
        context,
        event.isExpired
            ? 'This event has ended.'
            : 'This event is not active yet.',
      );
      return;
    }
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => EventQrScreen(event: event),
      ),
    );
    ref.invalidate(myEventsProvider);
  }
}
