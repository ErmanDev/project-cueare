import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../models/scan_preview_model.dart';
import '../../widgets/status_chip.dart';

enum ScanDecision { confirm, cancel }

/// Bottom sheet showing the student + computed "Morning — IN" with big
/// Confirm / Cancel buttons. Returns the moderator's decision.
class ScanResultSheet extends StatelessWidget {
  const ScanResultSheet({super.key, required this.preview});
  final ScanPreviewModel preview;

  static Future<ScanDecision?> show(BuildContext context, ScanPreviewModel p) =>
      showModalBottomSheet<ScanDecision>(
        context: context,
        isScrollControlled: true,
        isDismissible: false,
        enableDrag: false,
        showDragHandle: false,
        builder: (_) => ScanResultSheet(preview: p),
      );

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final s = preview.student;
    final blocked = !preview.canConfirm;
    final color = blocked
        ? AppTheme.blockedColor
        : preview.isLate
        ? AppTheme.lateColor
        : preview.isIn
        ? AppTheme.inColor
        : AppTheme.outColor;
    final directionLabel = blocked
        ? 'DONE'
        : preview.isLate
        ? '${preview.computedDirection} (LATE)'
        : preview.computedDirection;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 14),
                decoration: BoxDecoration(
                  color: scheme.outlineVariant,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Row(
              children: [
                _Avatar(photoUrl: s.photoUrl, name: s.fullName),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        s.fullName,
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        [
                          s.studentIdCode,
                          if (s.programLine.isNotEmpty) s.programLine,
                        ].join(' · '),
                        style: TextStyle(color: scheme.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            Container(
              padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: color, width: 2),
              ),
              child: Column(
                children: [
                  Text(
                    '${preview.sessionLabel} — $directionLabel',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: color,
                      fontSize: 28,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.4,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    blocked
                        ? (preview.message ??
                              'Already timed IN & OUT for ${preview.sessionLabel}')
                        : [
                            if (preview.message != null) preview.message!,
                            '${preview.sessionMode == 'manual' ? 'Manual session' : 'Auto session'} '
                                '· ${Fmt.hhmmRange(preview.sessionStart, preview.sessionEnd)} '
                                '· server ${Fmt.time(preview.serverTime)}',
                          ].join('\n'),
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: scheme.onSurfaceVariant,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            if (preview.existingScans.isNotEmpty) ...[
              const SizedBox(height: 12),
              Wrap(
                alignment: WrapAlignment.center,
                spacing: 8,
                runSpacing: 6,
                children: [
                  for (final e in preview.existingScans)
                    StatusChip.direction(e.direction),
                ],
              ),
            ],
            const SizedBox(height: 20),
            if (blocked)
              FilledButton.icon(
                onPressed: () => Navigator.pop(context, ScanDecision.cancel),
                icon: const Icon(Icons.close),
                label: const Text('OK, back to scanning'),
              )
            else
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(56),
                        foregroundColor: scheme.error,
                        side: BorderSide(color: scheme.error),
                      ),
                      onPressed: () =>
                          Navigator.pop(context, ScanDecision.cancel),
                      icon: const Icon(Icons.close),
                      label: const Text(
                        'Cancel',
                        style: TextStyle(fontSize: 18),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(
                        minimumSize: const Size.fromHeight(56),
                        backgroundColor: color,
                      ),
                      onPressed: () =>
                          Navigator.pop(context, ScanDecision.confirm),
                      icon: const Icon(Icons.check, size: 28),
                      label: Text(
                        'Confirm $directionLabel',
                        style: const TextStyle(fontSize: 18),
                      ),
                    ),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.photoUrl, required this.name});
  final String? photoUrl;
  final String name;

  @override
  Widget build(BuildContext context) {
    final initials = name.trim().isEmpty
        ? '?'
        : name
              .trim()
              .split(RegExp(r'\s+'))
              .take(2)
              .map((p) => p[0])
              .join()
              .toUpperCase();
    final fallback = CircleAvatar(
      radius: 32,
      child: Text(initials, style: const TextStyle(fontSize: 22)),
    );
    if (photoUrl == null || photoUrl!.isEmpty) return fallback;
    return CircleAvatar(
      radius: 32,
      backgroundImage: NetworkImage(photoUrl!),
      onBackgroundImageError: (_, _) {},
      child: null,
    );
  }
}
