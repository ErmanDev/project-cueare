import 'dart:ui' show PointerDeviceKind;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme/app_theme.dart';
import 'widgets/role_gate.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    ProviderScope(
      // Riverpod 3 retries failing providers with back-off by default and
      // reports "loading" meanwhile. We want the "server unreachable"
      // error to show immediately with a Retry button instead.
      retry: (_, _) => null,
      child: const SscAttendanceApp(),
    ),
  );
}

/// Mouse / trackpad dragging so lists and RefreshIndicator work on Windows.
class AppScrollBehavior extends MaterialScrollBehavior {
  @override
  Set<PointerDeviceKind> get dragDevices => {
    PointerDeviceKind.touch,
    PointerDeviceKind.mouse,
    PointerDeviceKind.stylus,
    PointerDeviceKind.trackpad,
  };
}

class SscAttendanceApp extends StatelessWidget {
  const SscAttendanceApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SSC QR Attendance',
      debugShowCheckedModeBanner: false,
      scrollBehavior: AppScrollBehavior(),
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      home: const RoleGate(),
    );
  }
}
