import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/utils/formatters.dart';
import '../../models/student_model.dart';
import '../../widgets/async_value_widget.dart';
import '../../widgets/error_banner.dart';
import '../../widgets/page_scaffold.dart';
import 'student_providers.dart';

class StudentProfileScreen extends ConsumerWidget {
  const StudentProfileScreen({super.key, required this.studentIdCode});
  final String studentIdCode;

  Future<void> _changePassword(BuildContext context) async {
    final changed = await showDialog<bool>(
      context: context,
      builder: (_) => const ChangePasswordDialog(),
    );
    if (changed == true && context.mounted) {
      showSnack(context, 'Password changed');
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final student = ref.watch(myStudentProvider(studentIdCode));

    return RefreshIndicator(
      onRefresh: () => ref.refresh(myStudentProvider(studentIdCode).future),
      child: AsyncValueWidget(
        value: student,
        onRetry: () => ref.invalidate(myStudentProvider(studentIdCode)),
        loadingMessage: 'Loading your profile…',
        data: (s) => ListView(
          padding: AppListPadding.standard,
          children: [
            _ProfileHeader(student: s),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: () => _changePassword(context),
              icon: const Icon(Icons.lock_outline),
              label: const Text('Change password'),
            ),
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                child: Column(
                  children: [
                    _BioRow(label: 'Student ID', value: s.studentIdCode),
                    _BioRow(label: 'First name', value: s.firstName),
                    _BioRow(label: 'Middle name', value: s.middleName),
                    _BioRow(label: 'Last name', value: s.lastName),
                    _BioRow(label: 'Course', value: s.course),
                    _BioRow(
                      label: 'Year level',
                      value: s.yearLevel == null ? null : Fmt.yearLevel(s.yearLevel),
                    ),
                    _BioRow(label: 'Section', value: s.section, last: true),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProfileHeader extends StatelessWidget {
  const _ProfileHeader({required this.student});
  final StudentModel student;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final name = student.fullName.trim();
    final initials = name.isEmpty
        ? '?'
        : name
              .split(RegExp(r'\s+'))
              .take(2)
              .map((p) => p[0])
              .join()
              .toUpperCase();
    final photo = student.photoUrl;
    return Column(
      children: [
        CircleAvatar(
          radius: 40,
          backgroundColor: scheme.primaryContainer,
          foregroundColor: scheme.onPrimaryContainer,
          backgroundImage: photo != null && photo.isNotEmpty
              ? NetworkImage(photo)
              : null,
          child: photo != null && photo.isNotEmpty
              ? null
              : Text(initials, style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w600)),
        ),
        const SizedBox(height: 12),
        Text(name.isEmpty ? 'Student' : name, style: text.titleLarge, textAlign: TextAlign.center),
        const SizedBox(height: 4),
        Text(student.studentIdCode, style: text.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
        if (student.programLine.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(
            student.programLine,
            style: text.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
            textAlign: TextAlign.center,
          ),
        ],
      ],
    );
  }
}

class _BioRow extends StatelessWidget {
  const _BioRow({required this.label, this.value, this.last = false});
  final String label;
  final String? value;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final shown = (value == null || value!.trim().isEmpty) ? '—' : value!;
    return Padding(
      padding: EdgeInsets.fromLTRB(0, 12, 0, last ? 12 : 0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(
              label,
              style: text.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
            ),
          ),
          Expanded(child: Text(shown, style: text.bodyLarge)),
        ],
      ),
    );
  }
}

class ChangePasswordDialog extends ConsumerStatefulWidget {
  const ChangePasswordDialog({super.key});

  @override
  ConsumerState<ChangePasswordDialog> createState() =>
      _ChangePasswordDialogState();
}

class _ChangePasswordDialogState extends ConsumerState<ChangePasswordDialog> {
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
              validator: (v) => (v == null || v.isEmpty) ? 'Required' : null,
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
              validator: (v) => v != _next.text ? 'Passwords do not match' : null,
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
