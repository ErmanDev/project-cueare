import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../widgets/async_value_widget.dart';
import '../superadmin/students/student_qr_dialog.dart';
import 'student_providers.dart';

class MyQrScreen extends ConsumerWidget {
  const MyQrScreen({super.key, required this.studentIdCode});
  final String studentIdCode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final student = ref.watch(myStudentProvider(studentIdCode));
    final scheme = Theme.of(context).colorScheme;

    return AsyncValueWidget(
      value: student,
      onRetry: () => ref.invalidate(myStudentProvider(studentIdCode)),
      loadingMessage: 'Loading your QR…',
      data: (s) => Center(
        child: SingleChildScrollView(
          padding: AppTheme.pagePadding,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 400),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: StudentQrCard(student: s, size: 260),
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  'Show this to the moderator to be scanned.\n'
                  'Turn your brightness up for faster scanning.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
