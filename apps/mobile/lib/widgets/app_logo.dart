import 'package:flutter/material.dart';

/// ACSSCO Bukidnon Campus emblem.
class AppLogo extends StatelessWidget {
  const AppLogo({super.key, this.size = 160, this.heroTag});

  final double size;
  final Object? heroTag;

  static const assetPath = 'assets/images/logo.png';

  @override
  Widget build(BuildContext context) {
    final image = Image.asset(
      assetPath,
      width: size,
      height: size,
      fit: BoxFit.contain,
      filterQuality: FilterQuality.high,
      semanticLabel: 'ACSSCO Bukidnon Campus logo',
    );
    if (heroTag == null) return image;
    return Hero(tag: heroTag!, child: image);
  }
}
