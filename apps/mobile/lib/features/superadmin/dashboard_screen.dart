import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/async_value_widget.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/status_chip.dart';
import 'attendance/attendance_screen.dart';
import 'events/events_screen.dart';
import 'moderators/moderators_screen.dart';
import 'sections/sections_screen.dart';
import 'students/students_screen.dart';

class SuperadminDashboardScreen extends ConsumerWidget {
  const SuperadminDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final scheme = Theme.of(context).colorScheme;

    final tiles = <_Tile>[
      _Tile(
        icon: Icons.event_available,
        title: 'Events & Sessions',
        subtitle: 'Create events and Morning / Afternoon windows',
        builder: (_) => const EventsScreen(),
      ),
      _Tile(
        icon: Icons.school,
        title: 'Students',
        subtitle: 'Add, import, edit, and view QR codes',
        builder: (_) => const StudentsScreen(),
      ),
      _Tile(
        icon: Icons.class_outlined,
        title: 'Sections',
        subtitle: 'Browse enrolled students by section',
        builder: (_) => const SectionsScreen(),
      ),
      _Tile(
        icon: Icons.badge,
        title: 'Moderators',
        subtitle: 'Accounts that scan attendance',
        builder: (_) => const ModeratorsScreen(),
      ),
      _Tile(
        icon: Icons.fact_check,
        title: 'Attendance Records',
        subtitle: 'Filter, correct, delete, export CSV',
        builder: (_) => const AttendanceScreen(),
      ),
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Superadmin'),
        actions: [
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
      body: AppContentWidth(
        child: ListView(
        padding: AppTheme.pagePadding,
        children: [
          Card(
            color: scheme.primaryContainer,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 26,
                    backgroundColor: scheme.primary,
                    foregroundColor: scheme.onPrimary,
                    child: Text(
                      (user?.name.isNotEmpty ?? false)
                          ? user!.name[0].toUpperCase()
                          : 'A',
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Welcome, ${user?.name ?? 'Admin'}',
                          style: Theme.of(context).textTheme.titleMedium
                              ?.copyWith(color: scheme.onPrimaryContainer),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          user?.username != null
                              ? '@${user!.username}'
                              : 'ACSSCO Bukidnon',
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(
                                color: scheme.onPrimaryContainer.withValues(
                                  alpha: 0.85,
                                ),
                              ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          for (final t in tiles)
            Card(
              child: InkWell(
                onTap: () => Navigator.of(
                  context,
                ).push(MaterialPageRoute<void>(builder: t.builder)),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 14,
                  ),
                  child: Row(
                    children: [
                      IconBadge(icon: t.icon),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              t.title,
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            const SizedBox(height: 2),
                            Text(
                              t.subtitle,
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(color: scheme.onSurfaceVariant),
                            ),
                          ],
                        ),
                      ),
                      Icon(
                        Icons.chevron_right,
                        color: scheme.onSurfaceVariant,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          const SizedBox(height: 20),
          Text(
            'Setup: create an event → add sections or students to the roster → '
            'create moderators → moderators scan.',
            textAlign: TextAlign.center,
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: scheme.outline),
          ),
          const SizedBox(height: 8),
        ],
        ),
      ),
    );
  }
}

class _Tile {
  const _Tile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.builder,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final WidgetBuilder builder;
}
