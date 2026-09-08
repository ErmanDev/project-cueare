import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/repositories.dart';
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
        onPressed: () => _showForm(context, ref),
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

  bool get isEdit => widget.existing != null;

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
      if (isEdit) {
        await repo.updateModerator(
          widget.existing!.id,
          name: _name.text.trim(),
          username: _username.text.trim(),
          password: _password.text,
        );
      } else {
        await repo.createModerator(
          name: _name.text.trim(),
          username: _username.text.trim(),
          password: _password.text,
        );
      }
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
      title: Text(isEdit ? 'Edit moderator' : 'New moderator'),
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
              decoration: InputDecoration(
                labelText: isEdit
                    ? 'New password (leave blank to keep)'
                    : 'Password',
              ),
              validator: (v) {
                if (isEdit && (v == null || v.isEmpty)) return null;
                if (v == null || v.length < 4) return 'At least 4 characters';
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
          child: Text(isEdit ? 'Save' : 'Create'),
        ),
      ],
    );
  }
}
