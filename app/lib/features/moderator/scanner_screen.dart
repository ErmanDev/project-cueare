import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../core/api/api_client.dart';
import '../../core/api/repositories.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../models/event_model.dart';
import '../../models/scan_preview_model.dart';
import 'moderator_providers.dart';
import 'scan_result_sheet.dart';
import 'session_override_widget.dart';

/// Camera + scan loop:
///   detect QR → POST /scan/preview → bottom sheet → Confirm/Cancel → resume.
class ScannerScreen extends ConsumerStatefulWidget {
  const ScannerScreen({super.key, required this.event});
  final EventModel event;

  @override
  ConsumerState<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends ConsumerState<ScannerScreen>
    with WidgetsBindingObserver {
  static bool get _cameraSupported =>
      kIsWeb || Platform.isAndroid || Platform.isIOS || Platform.isMacOS;

  final MobileScannerController _controller = MobileScannerController(
    autoStart: false,
    formats: const [BarcodeFormat.qrCode],
    detectionSpeed: DetectionSpeed.normal,
    detectionTimeoutMs: 800,
  );
  StreamSubscription<BarcodeCapture>? _sub;

  bool _busy = false; // a preview/confirm round-trip is in flight or sheet open
  String? _lastCode;
  DateTime? _lastCodeAt;
  int _confirmedThisSession = 0;
  ({String text, Color color})? _toast;
  Timer? _toastTimer;

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
    _toastTimer?.cancel();
    if (_cameraSupported) WidgetsBinding.instance.removeObserver(this);
    unawaited(_sub?.cancel());
    _sub = null;
    super.dispose();
    await _controller.dispose();
  }

  // ---------------------------------------------------------------------------
  // Scan handling
  // ---------------------------------------------------------------------------

  void _onBarcodes(BarcodeCapture capture) {
    if (_busy) return;
    final raw = capture.barcodes
        .map((b) => b.rawValue)
        .whereType<String>()
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .firstOrNull;
    if (raw == null) return;

    // Ignore the same code re-read within 3 seconds (student still holding
    // their phone up after we've handled it).
    final now = DateTime.now();
    if (raw == _lastCode &&
        _lastCodeAt != null &&
        now.difference(_lastCodeAt!) < const Duration(seconds: 3)) {
      return;
    }
    _lastCode = raw;
    _lastCodeAt = now;
    unawaited(_handlePayload(raw));
  }

  Future<void> _handlePayload(String payload, {int? forcedWindowId}) async {
    if (_busy) return;
    setState(() => _busy = true);
    final repo = ref.read(moderatorRepositoryProvider);
    final override = forcedWindowId ?? ref.read(sessionOverrideProvider);

    try {
      final preview = await repo.preview(
        eventId: widget.event.id,
        qrPayload: payload,
        sessionWindowId: override,
      );
      if (!mounted) return;
      await _showResult(preview);
    } on ApiFailure catch (e) {
      if (!mounted) return;
      if (e.code == 'NO_ACTIVE_WINDOW') {
        final picked = await _pickWindowDialog(e);
        if (picked != null && mounted) {
          setState(() => _busy = false);
          // Re-run with the chosen window; also remember it as the override
          // so the next students don't need to be asked again.
          ref.read(sessionOverrideProvider.notifier).set(picked);
          await _handlePayload(payload, forcedWindowId: picked);
          return;
        }
      } else {
        _flash(e.message, AppTheme.blockedColor);
      }
    } catch (e) {
      if (mounted) _flash(ApiFailure.from(e).message, AppTheme.blockedColor);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _showResult(ScanPreviewModel preview) async {
    final repo = ref.read(moderatorRepositoryProvider);
    final decision = await ScanResultSheet.show(context, preview);
    if (!mounted) return;

    if (!preview.canConfirm) {
      // Already IN & OUT — nothing to write. (Optionally log as cancelled.)
      unawaited(repo.cancel(preview).catchError((_) {}));
      return;
    }

    if (decision == ScanDecision.confirm) {
      try {
        final log = await repo.confirm(preview);
        _confirmedThisSession++;
        ref.invalidate(myScansProvider);
        _flash(
          '${log.studentName ?? preview.student.fullName} · '
          '${log.sessionLabel ?? preview.sessionLabel} ${log.direction} ✓',
          log.direction == 'IN' ? AppTheme.inColor : AppTheme.outColor,
        );
      } on ApiFailure catch (e) {
        if (e.code == 'DIRECTION_CHANGED' || e.code == 'ALREADY_COMPLETE') {
          _flash('${e.message} Re-scan the student.', AppTheme.blockedColor);
        } else {
          _flash(e.message, AppTheme.blockedColor);
        }
      } catch (e) {
        _flash(ApiFailure.from(e).message, AppTheme.blockedColor);
      }
    } else {
      // Audit trail; never blocks the moderator.
      unawaited(repo.cancel(preview).catchError((_) {}));
      _flash('Cancelled — nothing recorded', Colors.grey.shade700);
    }
  }

  Future<int?> _pickWindowDialog(ApiFailure e) async {
    final windows = (e.data?['available_windows'] as List<dynamic>? ?? [])
        .cast<Map<String, dynamic>>();
    final serverTime = e.data?['server_time'] as String?;
    return showDialog<int>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('No session open right now'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              serverTime == null
                  ? 'Server time is outside every session window.'
                  : 'Server time ${Fmt.time(DateTime.parse(serverTime))} is outside '
                        'every session window.',
            ),
            const SizedBox(height: 8),
            const Text('Pick a session to record this scan under:'),
            const SizedBox(height: 8),
            if (windows.isEmpty)
              Text(
                'This event has no session windows. Ask the superadmin to add them.',
                style: TextStyle(color: Theme.of(ctx).colorScheme.error),
              ),
            for (final w in windows)
              ListTile(
                dense: true,
                leading: const Icon(Icons.schedule),
                title: Text(w['session_label'] as String),
                subtitle: Text(
                  Fmt.hhmmRange(
                    w['start_time'] as String,
                    w['end_time'] as String,
                  ),
                ),
                onTap: () => Navigator.pop(ctx, w['id'] as int),
              ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Block this scan'),
          ),
        ],
      ),
    );
  }

  Future<void> _manualEntry() async {
    final controller = TextEditingController();
    final code = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Enter student code'),
        content: TextField(
          controller: controller,
          autofocus: true,
          autocorrect: false,
          textCapitalization: TextCapitalization.characters,
          decoration: const InputDecoration(hintText: 'STU-2026-0143'),
          onSubmitted: (v) => Navigator.pop(ctx, v),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
            onPressed: () => Navigator.pop(ctx, controller.text),
            child: const Text('Look up'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (code != null && code.trim().isNotEmpty) {
      await _handlePayload(code.trim());
    }
  }

  void _flash(String text, Color color) {
    _toastTimer?.cancel();
    setState(() => _toast = (text: text, color: color));
    _toastTimer = Timer(const Duration(seconds: 3), () {
      if (mounted) setState(() => _toast = null);
    });
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    // Keep the event fresh (session windows may change); fall back to the one
    // we were opened with.
    final event = ref.watch(selectedEventProvider) ?? widget.event;
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: Text(event.name, overflow: TextOverflow.ellipsis),
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
            tooltip: 'Type code manually',
            icon: const Icon(Icons.keyboard_alt_outlined),
            onPressed: _busy ? null : _manualEntry,
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
            child: SessionOverrideWidget(event: event, dense: true),
          ),
          Expanded(
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (_cameraSupported)
                  MobileScanner(
                    controller: _controller,
                    errorBuilder: (context, error) =>
                        _CameraError(error: error),
                  )
                else
                  _NoCameraFallback(onManual: _manualEntry),
                // Viewfinder
                if (_cameraSupported)
                  IgnorePointer(
                    child: Center(
                      child: Container(
                        width: 260,
                        height: 260,
                        decoration: BoxDecoration(
                          border: Border.all(
                            color: _busy
                                ? Colors.amber.shade300
                                : Colors.white.withValues(alpha: 0.85),
                            width: 3,
                          ),
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.25),
                              blurRadius: 12,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                if (_busy)
                  Positioned(
                    top: 16,
                    left: 0,
                    right: 0,
                    child: Center(
                      child: Material(
                        elevation: 2,
                        borderRadius: BorderRadius.circular(20),
                        color: scheme.surface.withValues(alpha: 0.92),
                        child: const Padding(
                          padding: EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 8,
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              ),
                              SizedBox(width: 10),
                              Text('Checking…'),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                if (_toast != null)
                  Positioned(
                    left: 16,
                    right: 16,
                    bottom: 16,
                    child: Material(
                      color: _toast!.color,
                      borderRadius: BorderRadius.circular(14),
                      elevation: 6,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 14,
                        ),
                        child: Text(
                          _toast!.text,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 16,
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          Material(
            color: scheme.surfaceContainerHighest,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  Icon(
                    Icons.qr_code_scanner,
                    size: 18,
                    color: scheme.onSurfaceVariant,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'Point the camera at a student QR code',
                    style: TextStyle(color: scheme.onSurfaceVariant),
                  ),
                  const Spacer(),
                  Text(
                    '$_confirmedThisSession confirmed',
                    style: TextStyle(
                      color: scheme.onSurfaceVariant,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CameraError extends StatelessWidget {
  const _CameraError({required this.error});
  final MobileScannerException error;

  @override
  Widget build(BuildContext context) {
    final msg = switch (error.errorCode) {
      MobileScannerErrorCode.permissionDenied =>
        'Camera permission denied. Allow camera access in system settings, '
            'or use "Type code manually".',
      MobileScannerErrorCode.unsupported =>
        'Camera scanning is not supported on this device. Use "Type code manually".',
      _ =>
        'Camera error: ${error.errorDetails?.message ?? error.errorCode.name}',
    };
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
            msg,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white),
          ),
        ],
      ),
    );
  }
}

class _NoCameraFallback extends StatelessWidget {
  const _NoCameraFallback({required this.onManual});
  final VoidCallback onManual;

  @override
  Widget build(BuildContext context) {
    return Container(
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
            'Camera scanning is only available on Android / iOS.\n'
            'Type the student code instead.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: onManual,
            icon: const Icon(Icons.keyboard),
            label: const Text('Enter code'),
          ),
        ],
      ),
    );
  }
}
