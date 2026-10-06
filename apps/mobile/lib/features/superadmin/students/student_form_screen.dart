import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/repositories.dart';
import '../../../models/student_model.dart';
import '../../../widgets/error_banner.dart';
import '../admin_providers.dart';
import 'student_qr_dialog.dart';

class StudentFormScreen extends ConsumerStatefulWidget {
  const StudentFormScreen({super.key, this.existing});
  final StudentModel? existing;

  @override
  ConsumerState<StudentFormScreen> createState() => _StudentFormScreenState();
}

class _StudentFormScreenState extends ConsumerState<StudentFormScreen> {
  final _form = GlobalKey<FormState>();
  late final _code = TextEditingController(
    text: widget.existing?.studentIdCode ?? '',
  );
  late final _name = TextEditingController(
    text: widget.existing?.fullName ?? '',
  );
  late final _section = TextEditingController(
    text: widget.existing?.section ?? '',
  );
  late final _photo = TextEditingController(
    text: widget.existing?.photoUrl ?? '',
  );
  bool _busy = false;

  bool get isEdit => widget.existing != null;

  @override
  void dispose() {
    _code.dispose();
    _name.dispose();
    _section.dispose();
    _photo.dispose();
    super.dispose();
  }

  String? _nullIfEmpty(String s) => s.trim().isEmpty ? null : s.trim();

  Future<void> _save({bool showQr = false}) async {
    if (!_form.currentState!.validate()) return;
    setState(() => _busy = true);
    final repo = ref.read(adminRepositoryProvider);
    try {
      final StudentModel saved;
      if (isEdit) {
        saved = await repo.updateStudent(
          widget.existing!.id,
          studentIdCode: _code.text.trim(),
          fullName: _name.text.trim(),
          section: _nullIfEmpty(_section.text),
          photoUrl: _nullIfEmpty(_photo.text),
        );
      } else {
        saved = await repo.createStudent(
          studentIdCode: _code.text.trim(),
          fullName: _name.text.trim(),
          section: _nullIfEmpty(_section.text),
          photoUrl: _nullIfEmpty(_photo.text),
        );
      }
      ref.invalidate(studentsProvider);
      if (!mounted) return;
      if (showQr) await StudentQrDialog.show(context, saved);
      if (mounted) Navigator.pop(context, saved);
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(isEdit ? 'Edit student' : 'New student')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: Form(
            key: _form,
            child: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                TextFormField(
                  controller: _code,
                  autocorrect: false,
                  textCapitalization: TextCapitalization.characters,
                  decoration: const InputDecoration(
                    labelText: 'Student ID code *',
                    hintText: 'STU-2026-0143',
                    helperText: 'This exact value is encoded in the QR code.',
                    prefixIcon: Icon(Icons.qr_code_2),
                  ),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? 'Required' : null,
                ),
                const SizedBox(height: 14),
                TextFormField(
                  controller: _name,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(
                    labelText: 'Full name *',
                    prefixIcon: Icon(Icons.person_outline),
                  ),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? 'Required' : null,
                ),
                const SizedBox(height: 14),
                TextFormField(
                  controller: _section,
                  textCapitalization: TextCapitalization.characters,
                  decoration: const InputDecoration(
                    labelText: 'Section / course',
                    hintText: 'BSIT-3A',
                    prefixIcon: Icon(Icons.class_outlined),
                  ),
                ),
                const SizedBox(height: 14),
                TextFormField(
                  controller: _photo,
                  keyboardType: TextInputType.url,
                  autocorrect: false,
                  decoration: const InputDecoration(
                    labelText: 'Photo URL (optional)',
                    prefixIcon: Icon(Icons.image_outlined),
                  ),
                ),
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: _busy ? null : () => _save(),
                  icon: const Icon(Icons.save),
                  label: Text(isEdit ? 'Save changes' : 'Create student'),
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: _busy ? null : () => _save(showQr: true),
                  icon: const Icon(Icons.qr_code),
                  label: const Text('Save & show QR'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
