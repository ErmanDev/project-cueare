import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/theme/app_theme.dart';
import '../../models/student_event_model.dart';
import '../../widgets/async_value_widget.dart';
import 'student_providers.dart';

class EventQrScreen extends ConsumerWidget {
  const EventQrScreen({super.key, required this.event});
  final StudentEventModel event;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final qr = ref.watch(myEventQrProvider(event.id));
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(title: Text(event.name)),
      body: AsyncValueWidget(
        value: qr,
        onRetry: () => ref.invalidate(myEventQrProvider(event.id)),
        loadingMessage: 'Preparing your QR…',
        data: (pass) => Center(
          child: SingleChildScrollView(
            padding: AppTheme.pagePadding,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Column(
                children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        children: [
                          ColoredBox(
                            color: Colors.white,
                            child: QrImageView(
                              data: pass.token,
                              version: QrVersions.auto,
                              size: 260,
                              backgroundColor: Colors.white,
                              errorCorrectionLevel: QrErrorCorrectLevel.M,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            pass.eventName,
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          if (pass.studentName.isNotEmpty)
                            Text(
                              pass.studentName,
                              textAlign: TextAlign.center,
                            ),
                          if (pass.studentIdCode != null)
                            Text(
                              pass.studentIdCode!,
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Show this to the moderator for this event.\n'
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
      ),
    );
  }
}
