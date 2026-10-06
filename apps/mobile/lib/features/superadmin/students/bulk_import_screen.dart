import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/repositories.dart';
import '../../../widgets/error_banner.dart';
import '../../../widgets/page_scaffold.dart';
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
      'StudentID,FName,LName,MName,COURSE,YrLevel,Sectioning\n'
      '02-26-0999,Juan,Dela Cruz,Santos,BSIT,1st Year,A\n'
      '02-26-1000,Maria,Clara,,BSBA,1st Year,B';

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
      body: AppContentWidth(
        child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Paste CSV using the school roster headers from sample_data.xls: '
            'StudentID, FName, LName, MName, COURSE, YrLevel, Sectioning. '
            'Extra columns are ignored. Tab-separated data pasted from Excel is accepted.',
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
      ),
    );
  }
}
