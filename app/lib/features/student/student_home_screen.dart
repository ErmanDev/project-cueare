import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/error_banner.dart';
import '../../widgets/page_scaffold.dart';
import 'my_attendance_screen.dart';
import 'my_fines_screen.dart';
import 'my_qr_screen.dart';
import 'student_profile_screen.dart';

/// Student shell: Attendance · raised QR · Fines.
class StudentHomeScreen extends ConsumerStatefulWidget {
  const StudentHomeScreen({super.key, required this.studentIdCode});
  final String studentIdCode;

  @override
  ConsumerState<StudentHomeScreen> createState() => _StudentHomeScreenState();
}

class _StudentHomeScreenState extends ConsumerState<StudentHomeScreen> {
  int _index = 0;

  Future<void> _changePassword(BuildContext context) async {
    final changed = await showDialog<bool>(
      context: context,
      builder: (_) => const _ChangePasswordDialog(),
    );
    if (changed == true && context.mounted) {
      showSnack(context, 'Password changed');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBody: true,
      appBar: AppBar(
        title: Text(switch (_index) {
          0 => 'Events',
          1 => 'My attendance',
          _ => 'Fines',
        }),
        actions: [
          IconButton(
            tooltip: 'Change password',
            icon: const Icon(Icons.lock_outline),
            onPressed: () => _changePassword(context),
          ),
          IconButton(
            tooltip: 'Log out',
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(authProvider.notifier).signOut(),
          ),
        ],
      ),
      body: AppContentWidth(
        child: Padding(
          padding: const EdgeInsets.only(bottom: 28),
          child: IndexedStack(
            index: _index,
            children: [
              const MyQrScreen(),
              MyAttendanceScreen(studentIdCode: widget.studentIdCode),
              const MyFinesScreen(),
            ],
          ),
        ),
      ),
      bottomNavigationBar: _StudentNavBar(
        index: _index,
        onSelect: (i) => setState(() => _index = i),
      ),
    );
  }
}

class _StudentNavBar extends StatelessWidget {
  const _StudentNavBar({required this.index, required this.onSelect});

  final int index;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surfaceContainerLowest,
      elevation: 3,
      shadowColor: AppTheme.navyDeep.withValues(alpha: 0.18),
      clipBehavior: Clip.none,
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 72,
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.bottomCenter,
            children: [
              Row(
                children: [
                  _StudentNavItem(
                    icon: Icons.history_outlined,
                    selectedIcon: Icons.history,
                    label: 'Attendance',
                    selected: index == 1,
                    onTap: () => onSelect(1),
                  ),
                  const SizedBox(width: 80),
                  _StudentNavItem(
                    icon: Icons.payments_outlined,
                    selectedIcon: Icons.payments,
                    label: 'Fines',
                    selected: index == 2,
                    onTap: () => onSelect(2),
                  ),
                ],
              ),
              Positioned(
                top: -14,
                child: _QrOrb(
                  selected: index == 0,
                  onTap: () => onSelect(0),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _QrOrb extends StatelessWidget {
  const _QrOrb({required this.selected, required this.onTap});

  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      button: true,
      selected: selected,
      label: 'QR',
      child: Tooltip(
        message: 'QR',
        child: Material(
          color: AppTheme.navy,
          shape: const CircleBorder(),
          elevation: selected ? 8 : 5,
          shadowColor: AppTheme.navyDeep.withValues(alpha: 0.4),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onTap,
            child: SizedBox(
              width: 58,
              height: 58,
              child: Icon(
                selected ? Icons.qr_code_2 : Icons.qr_code_2_outlined,
                color: scheme.onPrimary,
                size: 28,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _StudentNavItem extends StatelessWidget {
  const _StudentNavItem({
    required this.icon,
    required this.selectedIcon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final color = selected ? scheme.primary : scheme.onSurfaceVariant;
    return Expanded(
      child: InkWell(
        onTap: onTap,
        child: SizedBox.expand(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(selected ? selectedIcon : icon, color: color),
              const SizedBox(height: 4),
              Text(
                label,
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  color: color,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ChangePasswordDialog extends ConsumerStatefulWidget {
  const _ChangePasswordDialog();

  @override
  ConsumerState<_ChangePasswordDialog> createState() =>
      _ChangePasswordDialogState();
}

class _ChangePasswordDialogState extends ConsumerState<_ChangePasswordDialog> {
  final _form = GlobalKey<FormState>();
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      await ref.read(authProvider.notifier).changePassword(
        currentPassword: _current.text,
        newPassword: _next.text,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Change password'),
      content: Form(
        key: _form,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextFormField(
              controller: _current,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Current password'),
              validator: (v) =>
                  (v == null || v.isEmpty) ? 'Required' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _next,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'New password'),
              validator: (v) {
                if (v == null || v.length < 4) return 'At least 4 characters';
                return null;
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _confirm,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Confirm password'),
              validator: (v) =>
                  v != _next.text ? 'Passwords do not match' : null,
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : () => Navigator.pop(context, false),
          child: const Text('Cancel'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
          onPressed: _busy ? null : _save,
          child: Text(_busy ? 'Saving…' : 'Save'),
        ),
      ],
    );
  }
}
