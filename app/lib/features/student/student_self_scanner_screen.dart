import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../core/api/repositories.dart';
import '../../core/theme/app_theme.dart';
import '../../models/self_scan_result_model.dart';
import '../../widgets/error_banner.dart';

class StudentSelfScannerScreen extends ConsumerStatefulWidget {
  const StudentSelfScannerScreen({super.key});

  @override
  ConsumerState<StudentSelfScannerScreen> createState() =>
      _StudentSelfScannerScreenState();
}

class _StudentSelfScannerScreenState
    extends ConsumerState<StudentSelfScannerScreen>
    with WidgetsBindingObserver {
  static bool get _cameraSupported {
    return switch (defaultTargetPlatform) {
      TargetPlatform.android ||
      TargetPlatform.iOS ||
      TargetPlatform.macOS => true,
      _ => false,
    };
  }

  final MobileScannerController _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.normal,
    detectionTimeoutMs: 800,
  );
  StreamSubscription<BarcodeCapture>? _sub;

  bool _busy = false;
  String? _lastCode;
  DateTime? _lastCodeAt;

  @override
  void initState() {
    super.initState();
    if (_cameraSupported) {
      WidgetsBinding.instance.addObserver(this);
      _sub = _controller.barcodes.listen(_onBarcodes);
      unawaited(_controller.start());
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!_controller.value.hasCameraPermission) return;
    switch (state) {
      case AppLifecycleState.detached:
      case AppLifecycleState.hidden:
      case AppLifecycleState.paused:
        return;
      case AppLifecycleState.resumed:
        _sub ??= _controller.barcodes.listen(_onBarcodes);
        unawaited(_controller.start());
      case AppLifecycleState.inactive:
        unawaited(_sub?.cancel());
        _sub = null;
        unawaited(_controller.stop());
    }
  }

  @override
  Future<void> dispose() async {
    if (_cameraSupported) WidgetsBinding.instance.removeObserver(this);
    unawaited(_sub?.cancel());
    _sub = null;
    super.dispose();
    await _controller.dispose();
  }

  Future<void> _onBarcodes(BarcodeCapture capture) async {
    if (_busy) return;
    final barcode = capture.barcodes.firstOrNull;
    final raw = barcode?.rawValue?.trim();
    if (raw == null || raw.isEmpty) return;

    // Pause camera scanning immediately to avoid rapid re-triggers
    unawaited(_controller.stop());

    unawaited(HapticFeedback.selectionClick());
    await _processToken(raw);
  }

  Future<void> _processToken(String token) async {
    final now = DateTime.now();
    // Ignore identical QR token for 60 seconds to prevent spam scanning
    if (_lastCode == token &&
        _lastCodeAt != null &&
        now.difference(_lastCodeAt!).inSeconds < 60) {
      if (mounted && _cameraSupported) {
        unawaited(_controller.start());
      }
      return;
    }

    _lastCode = token;
    _lastCodeAt = now;
    setState(() => _busy = true);

    try {
      final res = await ref.read(studentRepositoryProvider).selfScan(token);
      if (res.isAccepted) {
        unawaited(HapticFeedback.mediumImpact());
      } else {
        unawaited(HapticFeedback.heavyImpact());
      }
      if (mounted) {
        await _showResultSheet(res);
      }
    } catch (e) {
      unawaited(HapticFeedback.vibrate());
      if (mounted) {
        showErrorSnack(context, e);
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
        // Resume camera only if screen is still mounted
        if (_cameraSupported) {
          unawaited(_controller.start());
        }
      }
    }
  }

  Future<void> _manualEntry() async {
    final token = await showDialog<String>(
      context: context,
      builder: (ctx) => const _ManualEntryDialog(),
    );
    if (token != null && token.trim().isNotEmpty) {
      await _processToken(token.trim());
    }
  }

  Future<void> _showResultSheet(SelfScanResultModel result) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) {
        final isOk = result.isAccepted;
        final isLate = result.isLate;
        final color = isOk
            ? (isLate ? AppTheme.lateColor : AppTheme.inColor)
            : Theme.of(context).colorScheme.error;
        return Padding(
          padding: const EdgeInsets.fromLTRB(24, 24, 24, 36),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                isOk
                    ? (isLate ? Icons.access_time_filled : Icons.check_circle_outline)
                    : Icons.error_outline,
                size: 64,
                color: color,
              ),
              const SizedBox(height: 16),
              Text(
                isOk
                    ? (isLate ? 'Recorded (LATE)' : 'Attendance Recorded')
                    : 'Scan Rejected',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: color,
                    ),
              ),
              const SizedBox(height: 8),
              Text(
                isLate
                    ? 'Check-in recorded after cutoff time (LATE).'
                    : result.userMessage,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              if (result.eventName != null) ...[
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Chip(
                      label: Text('${result.eventName} — ${result.sessionName ?? ""}'),
                    ),
                    if (isLate) ...[
                      const SizedBox(width: 8),
                      Chip(
                        backgroundColor: AppTheme.lateColor.withValues(alpha: 0.15),
                        side: BorderSide(color: AppTheme.lateColor),
                        label: Text(
                          'LATE',
                          style: TextStyle(
                            color: AppTheme.lateColor,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () {
                    Navigator.pop(context); // Close bottom sheet
                    if (isOk && mounted) {
                      Navigator.pop(context); // Return to student dashboard
                    }
                  },
                  child: Text(isOk ? 'Done' : 'Scan another'),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Scan Venue QR'),
        actions: [
          if (_cameraSupported) ...[
            IconButton(
              tooltip: 'Torch',
              icon: const Icon(Icons.flashlight_on_outlined),
              onPressed: () => _controller.toggleTorch(),
            ),
            IconButton(
              tooltip: 'Switch camera',
              icon: const Icon(Icons.cameraswitch_outlined),
              onPressed: () => _controller.switchCamera(),
            ),
          ],
          IconButton(
            tooltip: 'Type code',
            icon: const Icon(Icons.keyboard_alt_outlined),
            onPressed: _busy ? null : _manualEntry,
          ),
        ],
      ),
      body: Stack(
        children: [
          if (_cameraSupported)
            MobileScanner(
              controller: _controller,
              errorBuilder: (context, error) {
                return Container(
                  color: Colors.black87,
                  alignment: Alignment.center,
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.no_photography_outlined,
                        color: Colors.white70,
                        size: 56,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'Camera unavailable: ${error.errorCode.name}\n'
                        'Grant camera permission or enter token manually.',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.white),
                      ),
                      const SizedBox(height: 16),
                      FilledButton.icon(
                        onPressed: _manualEntry,
                        icon: const Icon(Icons.keyboard),
                        label: const Text('Enter token manually'),
                      ),
                    ],
                  ),
                );
              },
            )
          else
            Container(
              color: Colors.black87,
              alignment: Alignment.center,
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.desktop_windows_outlined,
                    color: Colors.white70,
                    size: 56,
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Camera scanning is not available on Windows/Desktop.\n'
                    'Type or paste venue QR token instead.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white),
                  ),
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    onPressed: _manualEntry,
                    icon: const Icon(Icons.keyboard),
                    label: const Text('Enter token'),
                  ),
                ],
              ),
            ),
          if (_cameraSupported) ...[
            Center(
              child: Container(
                width: 240,
                height: 240,
                decoration: BoxDecoration(
                  border: Border.all(color: scheme.primary, width: 3),
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
            ),
            Positioned(
              bottom: 40,
              left: 24,
              right: 24,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: Colors.black87,
                  borderRadius: BorderRadius.circular(24),
                ),
                child: const Text(
                  'Point your camera at the venue QR token screen',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white),
                ),
              ),
            ),
          ],
          if (_busy)
            const Positioned.fill(
              child: ColoredBox(
                color: Colors.black45,
                child: Center(
                  child: CircularProgressIndicator(),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _ManualEntryDialog extends StatefulWidget {
  const _ManualEntryDialog();

  @override
  State<_ManualEntryDialog> createState() => _ManualEntryDialogState();
}

class _ManualEntryDialogState extends State<_ManualEntryDialog> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Enter venue QR token'),
      content: TextField(
        controller: _controller,
        autofocus: true,
        autocorrect: false,
        decoration: const InputDecoration(
          hintText: 'Paste or type QR token',
        ),
        onSubmitted: (v) => Navigator.pop(context, v),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
          onPressed: () => Navigator.pop(context, _controller.text),
          child: const Text('Submit'),
        ),
      ],
    );
  }
}

