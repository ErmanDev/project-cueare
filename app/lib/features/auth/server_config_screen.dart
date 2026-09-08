import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_endpoints.dart';
import '../../core/config/server_settings.dart';
import '../../widgets/error_banner.dart';

/// One-time "where is the server?" screen. Also reachable from the login
/// screen and dashboards to change the address later.
class ServerConfigScreen extends ConsumerStatefulWidget {
  const ServerConfigScreen({super.key, this.canPop = false});

  /// When opened from inside the app (not first launch) show a back button.
  final bool canPop;

  @override
  ConsumerState<ServerConfigScreen> createState() => _ServerConfigScreenState();
}

class _ServerConfigScreenState extends ConsumerState<ServerConfigScreen> {
  final _controller = TextEditingController();
  bool _testing = false;
  String? _testResult;
  bool _testOk = false;

  @override
  void initState() {
    super.initState();
    final current = ref.read(serverSettingsProvider).value;
    _controller.text = current?.display ??
        (kIsWeb ? ServerSettings.sameOrigin?.display ?? 'localhost:8080' : '');
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  ServerSettings? _parsed() => ServerSettings.parse(_controller.text);

  Future<void> _test() async {
    final settings = _parsed();
    if (settings == null) {
      setState(() {
        _testResult = 'Enter an address like 192.168.1.10:8080';
        _testOk = false;
      });
      return;
    }
    setState(() {
      _testing = true;
      _testResult = null;
    });
    try {
      final dio = Dio(
        BaseOptions(
          baseUrl: settings.baseUrl,
          connectTimeout: const Duration(seconds: 5),
          receiveTimeout: const Duration(seconds: 5),
        ),
      );
      final res = await dio.get<Map<String, dynamic>>(ApiEndpoints.health);
      final ok = res.data?['status'] == 'ok';
      setState(() {
        _testOk = ok;
        _testResult = ok
            ? 'Connected! Server time: ${res.data?['server_time']}'
            : 'Reached ${settings.display} but it is not the attendance server.';
      });
    } catch (_) {
      setState(() {
        _testOk = false;
        _testResult =
            'Could not reach ${settings.display}. Is the server running, the '
            'firewall open on port ${settings.port}, and are you on the same Wi-Fi?';
      });
    } finally {
      if (mounted) setState(() => _testing = false);
    }
  }

  Future<void> _save() async {
    final settings = _parsed();
    if (settings == null) {
      showSnack(context, 'Enter an address like 192.168.1.10:8080');
      return;
    }
    await ref.read(serverSettingsProvider.notifier).save(settings);
    if (!mounted) return;
    showSnack(context, 'Server set to ${settings.display}');
    if (widget.canPop) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Server Settings'),
        automaticallyImplyLeading: widget.canPop,
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: ListView(
              padding: const EdgeInsets.all(24),
              children: [
                Icon(Icons.router, size: 64, color: scheme.primary),
                const SizedBox(height: 16),
                Text(
                  'Connect to the attendance server',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                Text(
                  kIsWeb
                      ? 'If you opened this from the attendance server URL, it '
                            'should already be connected. Otherwise enter the '
                            'laptop LAN address (same Wi-Fi).'
                      : 'Enter the LAN IP address and port of the laptop running the '
                            'server. Everyone must be on the same Wi-Fi network.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: scheme.onSurfaceVariant),
                ),
                const SizedBox(height: 24),
                TextField(
                  controller: _controller,
                  keyboardType: TextInputType.url,
                  autocorrect: false,
                  decoration: const InputDecoration(
                    labelText: 'Server address',
                    hintText: '192.168.1.10:8080',
                    prefixIcon: Icon(Icons.dns_outlined),
                  ),
                  onChanged: (_) => setState(() => _testResult = null),
                  onSubmitted: (_) => _test(),
                ),
                const SizedBox(height: 12),
                if (_testResult != null)
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: _testOk
                          ? scheme.primaryContainer
                          : scheme.errorContainer,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          _testOk ? Icons.check_circle : Icons.error_outline,
                          color: _testOk
                              ? scheme.onPrimaryContainer
                              : scheme.onErrorContainer,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _testResult!,
                            style: TextStyle(
                              color: _testOk
                                  ? scheme.onPrimaryContainer
                                  : scheme.onErrorContainer,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: _testing ? null : _test,
                  icon: _testing
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.network_check),
                  label: const Text('Test connection'),
                ),
                const SizedBox(height: 8),
                FilledButton.icon(
                  onPressed: _save,
                  icon: const Icon(Icons.save),
                  label: const Text('Save & continue'),
                ),
                const SizedBox(height: 24),
                Text(
                  'Tip: on the server laptop run `ipconfig` (Windows) and look '
                  'for the IPv4 address of the Wi-Fi adapter.',
                  textAlign: TextAlign.center,
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(color: scheme.outline),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
