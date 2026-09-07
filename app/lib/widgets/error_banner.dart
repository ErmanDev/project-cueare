import 'package:flutter/material.dart';

import '../core/api/api_client.dart';

/// Inline error with optional retry — used for failed provider loads.
class ErrorBanner extends StatelessWidget {
  const ErrorBanner({
    super.key,
    required this.error,
    this.onRetry,
    this.compact = false,
  });

  final Object error;
  final VoidCallback? onRetry;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final failure = ApiFailure.from(error);
    final scheme = Theme.of(context).colorScheme;
    final icon = failure.isNetwork ? Icons.wifi_off : Icons.error_outline;

    if (compact) {
      return Material(
        color: scheme.errorContainer,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            children: [
              Icon(icon, color: scheme.onErrorContainer, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  failure.message,
                  style: TextStyle(color: scheme.onErrorContainer),
                ),
              ),
              if (onRetry != null)
                TextButton(onPressed: onRetry, child: const Text('Retry')),
            ],
          ),
        ),
      );
    }

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48, color: scheme.error),
            const SizedBox(height: 12),
            Text(
              failure.message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 16),
              FilledButton.tonalIcon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: const Text('Retry'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Shows an [ApiFailure]-friendly snackbar.
void showErrorSnack(BuildContext context, Object error) {
  final failure = ApiFailure.from(error);
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(failure.message),
        backgroundColor: Theme.of(context).colorScheme.error,
      ),
    );
}

void showSnack(BuildContext context, String message, {Color? color}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message), backgroundColor: color));
}
