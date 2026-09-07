import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/repositories.dart';
import '../../../widgets/error_banner.dart';
import '../admin_providers.dart';

/// Paste CSV text (from Excel / Google Sheets) to bulk-create students.
class BulkImportScreen extends ConsumerStatefulWidget {
  const BulkImportScreen({super.key});

  @override
  ConsumerState<BulkImportScreen> createState() => _BulkImportScreenState();
}

class _BulkImportScreenState extends ConsumerState<BulkImportScreen> {
  final _csv = TextEditingController();
  bool _skipExisting = false;
  bool _busy = false;
  Map<String, dynamic>? _result;

  static const _template =
      'student_id_code,full_name,section\n'
      'STU-2026-0001,Juan Dela Cruz,BSIT-3A\n'
      'STU-2026-0002,Maria Clara,BSIT-3B';

  @override
  void dispose() {
    _csv.dispose();
    super.dispose();
  }

  Future<void> _paste() async {
    final data = await Clipboard.getData(Clipboard.kTextPlain);
    if (data?.text != null) {
      setState(() => _csv.text = data!.text!);
    }
  }

  Future<void> _import() async {
    if (_csv.text.trim().isEmpty) {
      showSnack(context, 'Paste some CSV first');
      return;
    }
    setState(() {
      _busy = true;
      _result = null;
    });
    try {
      final res = await ref
          .read(adminRepositoryProvider)
          .importStudentsCsv(_csv.text, skipExisting: _skipExisting);
      ref.invalidate(studentsProvider);
      setState(() => _result = res);
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final result = _result;
    return Scaffold(
      appBar: AppBar(title: const Text('Bulk import students')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Paste CSV with a header row. Columns: student_id_code, full_name, '
            'section (optional), photo_url (optional). Tab-separated data from a '
            'spreadsheet is fine if you replace tabs with commas first.',
            style: TextStyle(color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _csv,
            maxLines: 12,
            minLines: 8,
            autocorrect: false,
            style: const TextStyle(fontFamily: 'monospace', fontSize: 13),
            decoration: const InputDecoration(
              hintText: _template,
              alignLabelWithHint: true,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              TextButton.icon(
                onPressed: _paste,
                icon: const Icon(Icons.paste),
                label: const Text('Paste from clipboard'),
              ),
              TextButton.icon(
                onPressed: () => setState(() => _csv.text = _template),
                icon: const Icon(Icons.description_outlined),
                label: const Text('Use template'),
              ),
            ],
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Skip existing codes'),
            subtitle: const Text(
              'Off = update name/section of students whose code already exists',
            ),
            value: _skipExisting,
            onChanged: (v) => setState(() => _skipExisting = v),
          ),
          const SizedBox(height: 8),
          FilledButton.icon(
            onPressed: _busy ? null : _import,
            icon: _busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.upload),
            label: const Text('Import'),
          ),
          if (result != null) ...[
            const SizedBox(height: 20),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Import result',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    Text('Rows: ${result['total_rows']}'),
                    Text('Created: ${result['created']}'),
                    Text('Updated: ${result['updated']}'),
                    Text('Skipped: ${result['skipped']}'),
                    if ((result['errors'] as List).isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(
                        'Errors',
                        style: TextStyle(
                          color: scheme.error,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      for (final e in result['errors'] as List)
                        Text(
                          'Row ${e['row']}: ${e['error']}',
                          style: TextStyle(color: scheme.error),
                        ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
