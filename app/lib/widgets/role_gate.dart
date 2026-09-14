import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/auth/auth_state.dart';
import '../core/config/server_settings.dart';
import '../features/auth/login_screen.dart';
import '../features/moderator/dashboard_screen.dart';
import '../features/student/student_home_screen.dart';
import '../features/superadmin/dashboard_screen.dart';
import '../models/user_model.dart';
import 'loading_indicator.dart';

/// Routes by session. API host is resolved in the background — never a login field.
class RoleGate extends ConsumerWidget {
  const RoleGate({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(serverSettingsProvider);
    if (settings.isLoading) {
      return const Scaffold(body: LoadingIndicator(message: 'Starting…'));
    }

    final auth = ref.watch(authProvider);
    return auth.when(
      loading: () =>
          const Scaffold(body: LoadingIndicator(message: 'Starting…')),
      error: (e, _) => const LoginScreen(),
      data: (session) => switch (session) {
        SignedOut() => const LoginScreen(),
        StudentSession(:final studentIdCode) => StudentHomeScreen(
          studentIdCode: studentIdCode,
        ),
        StaffSession(:final user) => switch (user.role) {
          UserRole.superadmin => const SuperadminDashboardScreen(),
          UserRole.moderator => const ModeratorDashboardScreen(),
        },
      },
    );
  }
}
