import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTheme {
  // Primary Seed Color - Electric Indigo from Web Portal
  static const Color primaryIndigo = Color(0xFF6366F1);
  static const Color obsidianBlack = Color(0xFF000000);
  static const Color deepZinc = Color(0xFF09090B);
  static const Color borderZinc = Color(0xFF27272A);

  // Light Theme
  static ThemeData get lightTheme {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: primaryIndigo,
      brightness: Brightness.light,
    ).copyWith(
      primary: primaryIndigo,
      onPrimary: Colors.white,
      surface: const Color(0xFFF8FAF8),
      secondary: const Color(0xFFF97316), // Electric Orange
    );

    return _buildTheme(colorScheme);
  }

  // Android 16 Dark Obsidian Theme
  static ThemeData get darkTheme {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: primaryIndigo,
      brightness: Brightness.dark,
    ).copyWith(
      primary: primaryIndigo,
      surface: deepZinc,
      onSurface: const Color(0xFFEDEDED),
      surfaceContainer: borderZinc,
      outline: borderZinc,
    );

    return _buildTheme(colorScheme);
  }

  // Shared theme builder
  static ThemeData _buildTheme(ColorScheme colorScheme) {
    final isDark = colorScheme.brightness == Brightness.dark;

    // Material 3 Expressive Text Theme using Outfit
    final textTheme = GoogleFonts.outfitTextTheme().copyWith(
      displayLarge: GoogleFonts.outfit(
        fontWeight: FontWeight.w800,
        fontSize: 64,
        letterSpacing: -1.5,
        height: 1.0,
      ),
      displayMedium: GoogleFonts.outfit(
        fontWeight: FontWeight.w800,
        fontSize: 48,
        letterSpacing: -1.0,
        height: 1.1,
      ),
      displaySmall: GoogleFonts.outfit(
        fontWeight: FontWeight.w700,
        fontSize: 36,
        letterSpacing: -0.5,
      ),
      headlineLarge: GoogleFonts.outfit(
        fontWeight: FontWeight.w700,
        fontSize: 32,
        height: 1.2,
      ),
      headlineMedium: GoogleFonts.outfit(
        fontWeight: FontWeight.w700,
        fontSize: 28,
      ),
      titleLarge: GoogleFonts.outfit(
        fontWeight: FontWeight.w600,
        fontSize: 22,
      ),
      labelLarge: GoogleFonts.outfit(
        fontWeight: FontWeight.w600,
        fontSize: 16,
        letterSpacing: 0.1,
      ),
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: isDark ? obsidianBlack : colorScheme.surface,
      textTheme: textTheme,

      // AppBar Theme - Expressive & Minimal
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: textTheme.headlineSmall?.copyWith(
          color: colorScheme.onSurface,
          fontWeight: FontWeight.w800,
        ),
      ),

      // Filled Button - Pill Shape (Expressive)
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 18),
          shape: const StadiumBorder(), // Pill shape
          elevation: 0,
          textStyle: textTheme.labelLarge,
        ),
      ),

      // Card Theme - Android 16 Expressive (32px Radius)
      cardTheme: CardThemeData(
        elevation: 0,
        color: isDark ? deepZinc : Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(32),
          side: BorderSide(
            color: isDark ? borderZinc : colorScheme.outlineVariant,
            width: 1.5,
          ),
        ),
      ),

      // Input Decoration - Soft UI (Pill shape)
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: isDark ? deepZinc : colorScheme.surface,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(30),
          borderSide: BorderSide(
              color: isDark ? borderZinc : colorScheme.outlineVariant),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(30),
          borderSide: BorderSide(
              color: isDark ? borderZinc : colorScheme.outlineVariant),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(30),
          borderSide: BorderSide(color: colorScheme.primary, width: 2),
        ),
      ),

      // Navigation Bar - Material 3 Expressive
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: isDark ? deepZinc : colorScheme.surface,
        indicatorColor: colorScheme.primary.withOpacity(0.1),
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        height: 85,
        iconTheme: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return IconThemeData(color: colorScheme.primary, size: 28);
          }
          return IconThemeData(color: colorScheme.onSurfaceVariant);
        }),
      ),
    );
  }
}
