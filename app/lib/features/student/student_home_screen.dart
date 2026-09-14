import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../widgets/page_scaffold.dart';
import '../auth/server_config_screen.dart';
import 'my_attendance_screen.dart';
import 'my_qr_screen.dart';
import 'student_profile_screen.dart';

/// Student view: [My QR] / [My attendance] tabs.
class StudentHomeScreen extends ConsumerStatefulWidget {
  const StudentHomeScreen({super.key, required this.studentIdCode});
  final String studentIdCode;

  @override
  ConsumerState<StudentHomeScreen> createState() => _StudentHomeScreenState();
}

class _StudentHomeScreenState extends ConsumerState<StudentHomeScreen> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_index == 0 ? 'My QR code' : 'My attendance'),
        actions: [
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
            tooltip: 'Switch student / log out',
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(authProvider.notifier).signOut(),
          ),
        ],
      ),
      body: AppContentWidth(
        child: IndexedStack(
        index: _index,
        children: [
          MyQrScreen(studentIdCode: widget.studentIdCode),
          MyAttendanceScreen(studentIdCode: widget.studentIdCode),
        ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.qr_code_2_outlined),
            selectedIcon: Icon(Icons.qr_code_2),
            label: 'My QR',
          ),
          NavigationDestination(
            icon: Icon(Icons.history_outlined),
            selectedIcon: Icon(Icons.history),
            label: 'Attendance',
          ),
        ],
      ),
    );
  }
}
