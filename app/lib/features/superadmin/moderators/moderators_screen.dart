import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/repositories.dart';
import '../../../models/student_model.dart';
import '../../../models/user_model.dart';
import '../../../widgets/async_value_widget.dart';
import '../../../widgets/error_banner.dart';
import '../../../widgets/page_scaffold.dart';
import '../admin_providers.dart';

class ModeratorsScreen extends ConsumerWidget {
  const ModeratorsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final moderators = ref.watch(moderatorsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Moderators')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showAdd(context, ref),
        icon: const Icon(Icons.person_add),
        label: const Text('Add moderator'),
      ),
      body: AppContentWidth(
        child: RefreshIndicator(
        onRefresh: () => ref.refresh(moderatorsProvider.future),
        child: AsyncValueWidget(
          value: moderators,
          onRetry: () => ref.invalidate(moderatorsProvider),
          data: (list) {
            if (list.isEmpty) {
              return const EmptyState(
                icon: Icons.badge_outlined,
                title: 'No moderators yet',
                subtitle: 'Moderators are the accounts that scan QR codes.',
              );
            }
            return ListView.separated(
              padding: AppListPadding.standard,
              itemCount: list.length,
              separatorBuilder: (_, _) => const SizedBox(height: 4),
              itemBuilder: (context, i) {
                final m = list[i];
                final scheme = Theme.of(context).colorScheme;
                return Card(
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: scheme.primaryContainer,
                      foregroundColor: scheme.onPrimaryContainer,
                      child: Text(
                        m.name.isNotEmpty ? m.name[0].toUpperCase() : '?',
                      ),
                    ),
                    title: Text(m.name),
                    subtitle: Text('@${m.username}'),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (m.studentId != null)
                          TextButton(
                            onPressed: () => _demote(context, ref, m),
                            child: const Text('Demote to student'),
                          ),
                        IconButton(
                          tooltip: 'Edit / reset password',
                          icon: const Icon(Icons.edit_outlined),
                          onPressed: () =>
                              _showForm(context, ref, existing: m),
                        ),
                        IconButton(
                          tooltip: 'Delete',
                          icon: Icon(
                            Icons.delete_outline,
                            color: scheme.error,
                          ),
                          onPressed: () => _delete(context, ref, m),
                        ),
                      ],
                    ),
                    onTap: () => _showForm(context, ref, existing: m),
                  ),
                );
              },
            );
          },
        ),
        ),
      ),
    );
  }

  Future<void> _demote(BuildContext context, WidgetRef ref, UserModel m) async {
    final ok = await confirmDialog(
      context,
      title: 'Demote ${m.name} to student?',
      message: 'They will sign in as a student again.',
      confirmLabel: 'Demote to student',
    );
    if (!ok) return;
    try {
      await ref.read(adminRepositoryProvider).demoteModerator(m.id);
      ref.invalidate(moderatorsProvider);
      ref.invalidate(studentsProvider);
      if (context.mounted) showSnack(context, 'Demoted to student');
    } catch (e) {
      if (context.mounted) showErrorSnack(context, e);
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, UserModel m) async {
    final ok = await confirmDialog(
      context,
      title: 'Delete ${m.name}?',
      message:
          'Moderators who have already scanned attendance cannot be '
          'deleted — reset their password instead to revoke access.',
    );
    if (!ok) return;
    try {
      await ref.read(adminRepositoryProvider).deleteModerator(m.id);
      ref.invalidate(moderatorsProvider);
      if (context.mounted) showSnack(context, 'Moderator deleted');
    } catch (e) {
      if (context.mounted) showErrorSnack(context, e);
    }
  }

  Future<void> _showAdd(BuildContext context, WidgetRef ref) async {
    final saved = await showDialog<bool>(
      context: context,
      builder: (_) => const _AddModeratorDialog(),
    );
    if (saved == true) {
      ref.invalidate(moderatorsProvider);
      ref.invalidate(studentsProvider);
    }
  }

  Future<void> _showForm(
    BuildContext context,
    WidgetRef ref, {
    UserModel? existing,
  }) async {
    final saved = await showDialog<bool>(
      context: context,
      builder: (_) => _ModeratorFormDialog(existing: existing),
    );
    if (saved == true) ref.invalidate(moderatorsProvider);
  }
}

class _AddModeratorDialog extends ConsumerStatefulWidget {
  const _AddModeratorDialog();

  @override
  ConsumerState<_AddModeratorDialog> createState() => _AddModeratorDialogState();
}

class _AddModeratorDialogState extends ConsumerState<_AddModeratorDialog> {
  final _search = TextEditingController();
  Timer? _debounce;
  List<StudentModel> _results = const [];
  StudentModel? _selected;
  bool _loading = true;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _searchStudents();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _onSearch(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), _searchStudents);
  }

  Future<void> _searchStudents() async {
    setState(() => _loading = true);
    try {
      final page = await ref.read(adminRepositoryProvider).studentsPage(
        query: _search.text.trim(),
        perPage: 8,
      );
      if (!mounted) return;
      setState(() {
        _results = page.students;
        if (_selected != null &&
            !_results.any((s) => s.id == _selected!.id)) {
          _selected = null;
        }
      });
    } catch (e) {
      if (mounted) {
        setState(() => _results = const []);
        showErrorSnack(context, e);
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _promote() async {
    final student = _selected;
    if (student == null || student.userId != null) return;
    setState(() => _busy = true);
    try {
      await ref
          .read(adminRepositoryProvider)
          .promoteStudentToModerator(student.id);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return AlertDialog(
      title: const Text('Add moderator'),
      content: SizedBox(
        width: 420,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Search a student and promote them to moderator. They sign in with their student ID as username and password until you change it.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _search,
              onChanged: _onSearch,
              textInputAction: TextInputAction.search,
              decoration: const InputDecoration(
                labelText: 'Search students',
                hintText: 'Name or student ID',
                prefixIcon: Icon(Icons.search),
              ),
            ),
            const SizedBox(height: 12),
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 280),
              child: _loading
                  ? const Center(
                      child: Padding(
                        padding: EdgeInsets.all(24),
                        child: CircularProgressIndicator(),
                      ),
                    )
                  : _results.isEmpty
                  ? const Padding(
                      padding: EdgeInsets.symmetric(vertical: 16),
                      child: Text('No matching students'),
                    )
                  : ListView.builder(
                      shrinkWrap: true,
                      itemCount: _results.length,
                      itemBuilder: (context, i) {
                        final s = _results[i];
                        final already = s.userId != null;
                        final selected = _selected?.id == s.id;
                        return ListTile(
                          selected: selected,
                          enabled: !already,
                          leading: CircleAvatar(
                            backgroundColor: selected
                                ? scheme.primary
                                : scheme.primaryContainer,
                            foregroundColor: selected
                                ? scheme.onPrimary
                                : scheme.onPrimaryContainer,
                            child: Text(
                              s.fullName.isNotEmpty
                                  ? s.fullName[0].toUpperCase()
                                  : '?',
                            ),
                          ),
                          title: Text(s.fullName),
                          subtitle: Text(
                            already
                                ? '${s.studentIdCode} · already a moderator'
                                : s.studentIdCode,
                          ),
                          onTap: already
                              ? null
                              : () => setState(() => _selected = s),
                        );
                      },
                    ),
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
          onPressed: _busy || _selected == null || _selected!.userId != null
              ? null
              : _promote,
          child: Text(_busy ? 'Saving…' : 'Promote moderator'),
        ),
      ],
    );
  }
}

class _ModeratorFormDialog extends ConsumerStatefulWidget {
  const _ModeratorFormDialog({this.existing});
  final UserModel? existing;

  @override
  ConsumerState<_ModeratorFormDialog> createState() =>
      _ModeratorFormDialogState();
}

class _ModeratorFormDialogState extends ConsumerState<_ModeratorFormDialog> {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.existing?.name ?? '');
  late final _username = TextEditingController(
    text: widget.existing?.username ?? '',
  );
  final _password = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _busy = true);
    final repo = ref.read(adminRepositoryProvider);
    try {
      await repo.updateModerator(
        widget.existing!.id,
        name: _name.text.trim(),
        username: _username.text.trim(),
        password: _password.text,
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
      title: const Text('Edit moderator'),
      content: Form(
        key: _form,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextFormField(
              controller: _name,
              decoration: const InputDecoration(labelText: 'Full name'),
              textCapitalization: TextCapitalization.words,
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Required' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _username,
              decoration: const InputDecoration(labelText: 'Username'),
              autocorrect: false,
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Required' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _password,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: 'New password (leave blank to keep)',
              ),
              validator: (v) {
                if (v == null || v.isEmpty) return null;
                if (v.length < 4) return 'At least 4 characters';
                return null;
              },
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
          child: const Text('Save'),
        ),
      ],
    );
  }
}
