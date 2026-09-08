import 'package:flutter/foundation.dart';
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

/// On web, centers content so cards don't stretch across a wide desktop.
/// Phone / tablet native builds stay full width.
class AppContentWidth extends StatelessWidget {
  const AppContentWidth({
    super.key,
    required this.child,
    this.maxWidth = AppTheme.contentMaxWidth,
  });

  final Widget child;
  final double maxWidth;

  @override
  Widget build(BuildContext context) {
    if (!kIsWeb) return child;
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth < maxWidth
            ? constraints.maxWidth
            : maxWidth;
        return Align(
          alignment: Alignment.topCenter,
          child: SizedBox(
            width: width,
            height: constraints.maxHeight.isFinite
                ? constraints.maxHeight
                : null,
            child: child,
          ),
        );
      },
    );
  }
}

/// List padding used across admin / moderator list screens.
class AppListPadding {
  static const EdgeInsets standard = EdgeInsets.fromLTRB(12, 12, 12, 88);
  static const EdgeInsets compact = EdgeInsets.fromLTRB(12, 8, 12, 24);
}
