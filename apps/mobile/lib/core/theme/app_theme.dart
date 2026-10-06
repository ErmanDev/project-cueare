import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Palette from the ACSSCO Bukidnon Campus emblem.
abstract class AppTheme {
  /// Shield / laurel navy.
  static const seed = Color(0xFF23326B);
  static const navy = Color(0xFF23326B);
  static const navyDeep = Color(0xFF1A2554);

  /// Emblem accent diamond.
  static const accentRed = Color(0xFFDA1F28);

  static const inColor = Color(0xFF15803D); // green — IN scans
  static const outColor = Color(0xFFC2410C); // orange — OUT scans
  static const lateColor = Color(0xFFD97706); // amber — late IN
  static const blockedColor = accentRed;

  static const pagePadding = EdgeInsets.all(16);
  static const pagePaddingCompact = EdgeInsets.symmetric(
    horizontal: 16,
    vertical: 12,
  );
  static const formMaxWidth = 560.0;
  static const contentMaxWidth = 720.0;
  static const radius = 12.0;

  static ThemeData light() => _base(Brightness.light);
  static ThemeData dark() => _base(Brightness.dark);

  static ColorScheme _scheme(Brightness brightness) {
    if (brightness == Brightness.light) {
      return ColorScheme(
        brightness: Brightness.light,
        primary: navy,
        onPrimary: Colors.white,
        primaryContainer: const Color(0xFFD9DEF0),
        onPrimaryContainer: navyDeep,
        secondary: accentRed,
        onSecondary: Colors.white,
        secondaryContainer: const Color(0xFFFFDAD8),
        onSecondaryContainer: const Color(0xFF410006),
        tertiary: const Color(0xFF4A5690),
        onTertiary: Colors.white,
        tertiaryContainer: const Color(0xFFDCE1FF),
        onTertiaryContainer: const Color(0xFF03174A),
        error: accentRed,
        onError: Colors.white,
        errorContainer: const Color(0xFFFFDAD8),
        onErrorContainer: const Color(0xFF410006),
        surface: const Color(0xFFF7F8FC),
        onSurface: const Color(0xFF1A1C22),
        onSurfaceVariant: const Color(0xFF454754),
        outline: const Color(0xFF757686),
        outlineVariant: const Color(0xFFC5C6D6),
        shadow: Colors.black,
        scrim: Colors.black,
        inverseSurface: navyDeep,
        onInverseSurface: const Color(0xFFF0F1F8),
        inversePrimary: const Color(0xFFB4C0F0),
        surfaceTint: navy,
        surfaceContainerLowest: Colors.white,
        surfaceContainerLow: const Color(0xFFF1F3FA),
        surfaceContainer: const Color(0xFFEAECF5),
        surfaceContainerHigh: const Color(0xFFE4E6F1),
        surfaceContainerHighest: const Color(0xFFDEE0EC),
      );
    }

    return ColorScheme(
      brightness: Brightness.dark,
      primary: const Color(0xFFB4C0F0),
      onPrimary: navyDeep,
      primaryContainer: const Color(0xFF3A4A84),
      onPrimaryContainer: const Color(0xFFD9DEF0),
      secondary: const Color(0xFFFFB3AE),
      onSecondary: const Color(0xFF68000E),
      secondaryContainer: const Color(0xFF930018),
      onSecondaryContainer: const Color(0xFFFFDAD8),
      tertiary: const Color(0xFFB8C4FF),
      onTertiary: const Color(0xFF1A2B60),
      tertiaryContainer: const Color(0xFF324178),
      onTertiaryContainer: const Color(0xFFDCE1FF),
      error: const Color(0xFFFFB3AE),
      onError: const Color(0xFF68000E),
      errorContainer: const Color(0xFF930018),
      onErrorContainer: const Color(0xFFFFDAD8),
      surface: const Color(0xFF12141A),
      onSurface: const Color(0xFFE3E5ED),
      onSurfaceVariant: const Color(0xFFC5C6D6),
      outline: const Color(0xFF8F90A0),
      outlineVariant: const Color(0xFF454754),
      shadow: Colors.black,
      scrim: Colors.black,
      inverseSurface: const Color(0xFFE3E5ED),
      onInverseSurface: navyDeep,
      inversePrimary: navy,
      surfaceTint: const Color(0xFFB4C0F0),
      surfaceContainerLowest: const Color(0xFF0D0F14),
      surfaceContainerLow: const Color(0xFF1A1C22),
      surfaceContainer: const Color(0xFF1E2026),
      surfaceContainerHigh: const Color(0xFF282A31),
      surfaceContainerHighest: const Color(0xFF33353C),
    );
  }

  static ThemeData _base(Brightness brightness) {
    final scheme = _scheme(brightness);
    final isLight = brightness == Brightness.light;
    final base = ThemeData(
      colorScheme: scheme,
      useMaterial3: true,
      brightness: brightness,
    );
    final text = base.textTheme.copyWith(
      headlineSmall: base.textTheme.headlineSmall?.copyWith(
        fontWeight: FontWeight.w700,
        letterSpacing: -0.2,
      ),
      titleLarge: base.textTheme.titleLarge?.copyWith(
        fontWeight: FontWeight.w700,
      ),
      titleMedium: base.textTheme.titleMedium?.copyWith(
        fontWeight: FontWeight.w600,
      ),
      titleSmall: base.textTheme.titleSmall?.copyWith(
        fontWeight: FontWeight.w600,
      ),
      bodyLarge: base.textTheme.bodyLarge?.copyWith(height: 1.35),
      bodyMedium: base.textTheme.bodyMedium?.copyWith(height: 1.35),
      bodySmall: base.textTheme.bodySmall?.copyWith(
        color: scheme.onSurfaceVariant,
        height: 1.35,
      ),
      labelLarge: base.textTheme.labelLarge?.copyWith(
        fontWeight: FontWeight.w600,
      ),
    );

    final outline = OutlineInputBorder(
      borderRadius: BorderRadius.circular(radius),
      borderSide: BorderSide(color: scheme.outlineVariant),
    );

    final appBarFg = isLight ? Colors.white : scheme.onSurface;
    final appBarBg = isLight ? navy : scheme.surface;

    return base.copyWith(
      textTheme: text,
      scaffoldBackgroundColor: scheme.surface,
      appBarTheme: AppBarTheme(
        centerTitle: false,
        scrolledUnderElevation: 0,
        elevation: 0,
        backgroundColor: appBarBg,
        foregroundColor: appBarFg,
        surfaceTintColor: Colors.transparent,
        iconTheme: IconThemeData(color: appBarFg),
        actionsIconTheme: IconThemeData(color: appBarFg),
        titleTextStyle: text.titleLarge?.copyWith(color: appBarFg),
        systemOverlayStyle: isLight
            ? SystemUiOverlayStyle.light
            : SystemUiOverlayStyle.light,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surfaceContainerLowest,
        border: outline,
        enabledBorder: outline,
        focusedBorder: outline.copyWith(
          borderSide: BorderSide(color: scheme.primary, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 14,
          vertical: 14,
        ),
        isDense: true,
      ),
      cardTheme: CardThemeData(
        clipBehavior: Clip.antiAlias,
        elevation: 0,
        color: scheme.surfaceContainerLowest,
        margin: const EdgeInsets.symmetric(vertical: 6),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radius),
          side: BorderSide(color: scheme.outlineVariant.withValues(alpha: 0.55)),
        ),
      ),
      listTileTheme: ListTileThemeData(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radius),
        ),
        iconColor: scheme.primary,
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 68,
        backgroundColor: scheme.surfaceContainerLowest,
        indicatorColor: scheme.primaryContainer,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return text.labelMedium?.copyWith(
            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
            color: selected ? scheme.primary : scheme.onSurfaceVariant,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return IconThemeData(
            color: selected ? scheme.primary : scheme.onSurfaceVariant,
          );
        }),
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: scheme.primary,
        foregroundColor: scheme.onPrimary,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
        extendedPadding: const EdgeInsets.symmetric(horizontal: 20),
      ),
      chipTheme: ChipThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        side: BorderSide.none,
        labelStyle: text.labelMedium,
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 0),
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: ButtonStyle(
          visualDensity: VisualDensity.standard,
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          minimumSize: const WidgetStatePropertyAll(Size(0, 44)),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(48),
          backgroundColor: scheme.primary,
          foregroundColor: scheme.onPrimary,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radius),
          ),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(48),
          foregroundColor: scheme.primary,
          side: BorderSide(color: scheme.primary.withValues(alpha: 0.45)),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radius),
          ),
        ),
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: scheme.primary,
        unselectedLabelColor: scheme.onSurfaceVariant,
        indicatorColor: accentRed,
        dividerColor: Colors.transparent,
      ),
      snackBarTheme: const SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
      ),
      dividerTheme: DividerThemeData(
        color: scheme.outlineVariant.withValues(alpha: 0.6),
        space: 1,
      ),
    );
  }
}
