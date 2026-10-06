import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/repositories.dart';
import '../../../models/student_model.dart';
import '../../../widgets/async_value_widget.dart';
import '../../../widgets/error_banner.dart';
import '../../../widgets/page_scaffold.dart';
import '../admin_providers.dart';
import 'bulk_import_screen.dart';
import 'student_form_screen.dart';
import 'student_qr_dialog.dart';

class StudentsScreen extends ConsumerStatefulWidget {
  const StudentsScreen({super.key});

  @override
  ConsumerState<StudentsScreen> createState() => _StudentsScreenState();
}

class _StudentsScreenState extends ConsumerState<StudentsScreen> {
  final _search = TextEditingController();
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _search.text = ref.read(studentSearchProvider);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _onSearch(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      ref.read(studentSearchProvider.notifier).set(v.trim());
    });
  }

  Future<void> _delete(StudentModel s) async {
    final ok = await confirmDialog(
      context,
      title: 'Delete ${s.fullName}?',
      message: 'Their attendance records will also be deleted.',
    );
    if (!ok) return;
    try {
      await ref.read(adminRepositoryProvider).deleteStudent(s.id);
      ref.invalidate(studentsProvider);
      if (mounted) showSnack(context, 'Student deleted');
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    }
  }

  void _open(Widget screen) => Navigator.of(
    context,
  ).push(MaterialPageRoute<void>(builder: (_) => screen));

  @override
  Widget build(BuildContext context) {
    final students = ref.watch(studentsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Students'),
        actions: [
          IconButton(
            tooltip: 'Bulk import (Excel / CSV)',
            icon: const Icon(Icons.upload_file),
            onPressed: () => _open(const BulkImportScreen()),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: TextField(
              controller: _search,
              onChanged: _onSearch,
              decoration: InputDecoration(
                hintText: 'Search name, code or section',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _search.text.isEmpty
                    ? null
                    : IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          _search.clear();
                          _onSearch('');
                        },
                      ),
                filled: true,
              ),
            ),
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _open(const StudentFormScreen()),
        icon: const Icon(Icons.add),
        label: const Text('Add student'),
      ),
      body: AppContentWidth(
        child: RefreshIndicator(
        onRefresh: () => ref.refresh(studentsProvider.future),
        child: AsyncValueWidget(
          value: students,
          onRetry: () => ref.invalidate(studentsProvider),
          data: (list) {
            if (list.isEmpty) {
              return EmptyState(
                icon: Icons.school_outlined,
                title: _search.text.isEmpty ? 'No students yet' : 'No matches',
                subtitle: _search.text.isEmpty
                    ? 'Add students one by one or import a CSV.'
                    : null,
                action: _search.text.isEmpty
                    ? OutlinedButton.icon(
                        onPressed: () => _open(const BulkImportScreen()),
                        icon: const Icon(Icons.upload_file),
                        label: const Text('Bulk import'),
                      )
                    : null,
              );
            }
            return ListView.separated(
              padding: AppListPadding.standard,
              itemCount: list.length + 1,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, i) {
                if (i == 0) {
                  return Padding(
                    padding: const EdgeInsets.fromLTRB(4, 4, 4, 8),
                    child: Text(
                      '${list.length} student${list.length == 1 ? '' : 's'}',
                      style: Theme.of(context).textTheme.labelLarge?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  );
                }
                final s = list[i - 1];
                final scheme = Theme.of(context).colorScheme;
                return Card(
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: scheme.primaryContainer,
                      foregroundColor: scheme.onPrimaryContainer,
                      child: Text(
                        s.fullName.isNotEmpty ? s.fullName[0].toUpperCase() : '?',
                      ),
                    ),
                    title: Text(s.fullName),
                    subtitle: Text(
                      [
                        s.studentIdCode,
                        if (s.programLine.isNotEmpty) s.programLine,
                      ].join(' · '),
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          tooltip: 'Show QR',
                          icon: const Icon(Icons.qr_code_2),
                          onPressed: () => StudentQrDialog.show(context, s),
                        ),
                        PopupMenuButton<String>(
                          onSelected: (v) {
                            if (v == 'edit') {
                              _open(StudentFormScreen(existing: s));
                            }
                            if (v == 'delete') _delete(s);
                          },
                          itemBuilder: (_) => const [
                            PopupMenuItem(value: 'edit', child: Text('Edit')),
                            PopupMenuItem(
                              value: 'delete',
                              child: Text('Delete'),
                            ),
                          ],
                        ),
                      ],
                    ),
                    onTap: () => StudentQrDialog.show(context, s),
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
}
