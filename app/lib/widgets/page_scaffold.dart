import 'package:flutter/material.dart';

import '../core/theme/app_theme.dart';

/// Centers content and caps width for forms / readable pages.
class AppPage extends StatelessWidget {
  const AppPage({
    super.key,
    required this.child,
    this.padding = AppTheme.pagePadding,
    this.maxWidth = AppTheme.formMaxWidth,
    this.scrollable = true,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double maxWidth;
  final bool scrollable;

  @override
  Widget build(BuildContext context) {
    final body = Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth),
        child: Padding(padding: padding, child: child),
      ),
    );
    if (!scrollable) return body;
    return SingleChildScrollView(child: body);
  }
}

/// List padding used across admin / moderator list screens.
class AppListPadding {
  static const EdgeInsets standard = EdgeInsets.fromLTRB(12, 12, 12, 88);
  static const EdgeInsets compact = EdgeInsets.fromLTRB(12, 8, 12, 24);
}
