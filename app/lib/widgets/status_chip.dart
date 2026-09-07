import 'package:flutter/material.dart';

import '../core/theme/app_theme.dart';

enum StatusChipTone { neutral, primary, success, warning, danger }

/// Compact status pill for Active / Today / IN / OUT / etc.
class StatusChip extends StatelessWidget {
  const StatusChip({
    super.key,
    required this.label,
    this.tone = StatusChipTone.neutral,
    this.icon,
  });

  final String label;
  final StatusChipTone tone;
  final IconData? icon;

  factory StatusChip.active(bool active) => StatusChip(
    label: active ? 'Active' : 'Inactive',
    tone: active ? StatusChipTone.primary : StatusChipTone.neutral,
  );

  factory StatusChip.today() => const StatusChip(
    label: 'Today',
    tone: StatusChipTone.primary,
    icon: Icons.today,
  );

  factory StatusChip.expired() => const StatusChip(
    label: 'Expired',
    tone: StatusChipTone.danger,
  );

  factory StatusChip.direction(String direction, {bool blocked = false}) {
    if (blocked) {
      return const StatusChip(
        label: 'DONE',
        tone: StatusChipTone.danger,
        icon: Icons.block,
      );
    }
    final isIn = direction.toUpperCase() == 'IN';
    return StatusChip(
      label: direction.toUpperCase(),
      tone: isIn ? StatusChipTone.success : StatusChipTone.warning,
      icon: isIn ? Icons.login : Icons.logout,
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (bg, fg) = switch (tone) {
      StatusChipTone.neutral => (
        scheme.surfaceContainerHighest,
        scheme.onSurfaceVariant,
      ),
      StatusChipTone.primary => (scheme.primaryContainer, scheme.onPrimaryContainer),
      StatusChipTone.success => (
        AppTheme.inColor.withValues(alpha: 0.14),
        AppTheme.inColor,
      ),
      StatusChipTone.warning => (
        AppTheme.outColor.withValues(alpha: 0.14),
        AppTheme.outColor,
      ),
      StatusChipTone.danger => (
        AppTheme.blockedColor.withValues(alpha: 0.14),
        AppTheme.blockedColor,
      ),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 14, color: fg),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
              color: fg,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

/// Tinted icon well used on dashboard nav tiles.
class IconBadge extends StatelessWidget {
  const IconBadge({super.key, required this.icon, this.size = 44});

  final IconData icon;
  final double size;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: scheme.primaryContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Icon(icon, color: scheme.onPrimaryContainer, size: size * 0.48),
    );
  }
}
