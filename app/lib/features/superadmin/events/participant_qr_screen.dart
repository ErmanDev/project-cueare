import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../../core/api/repositories.dart';
import '../../../models/event_model.dart';
import '../../../models/event_participant_model.dart';
import '../../../widgets/async_value_widget.dart';
import '../../../widgets/error_banner.dart';
import '../../../widgets/loading_indicator.dart';
import '../../../widgets/page_scaffold.dart';

class ParticipantQrScreen extends ConsumerStatefulWidget {
  const ParticipantQrScreen({super.key, required this.event, this.studentId});
  final EventModel event;
  final int? studentId;

  @override
  ConsumerState<ParticipantQrScreen> createState() =>
      _ParticipantQrScreenState();
}

class _ParticipantQrScreenState extends ConsumerState<ParticipantQrScreen> {
  List<EventParticipantTokenModel>? _tokens;
  Object? _error;
  int? _busyId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _error = null;
      _tokens = null;
    });
    try {
      final tokens = await ref
          .read(adminRepositoryProvider)
          .generateEventTokens(widget.event.id);
      if (mounted) setState(() => _tokens = tokens);
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _revoke(EventParticipantTokenModel t) async {
    setState(() => _busyId = t.tokenId);
    try {
      await ref
          .read(adminRepositoryProvider)
          .revokeEventToken(widget.event.id, t.tokenId);
      await _load();
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _reissue(EventParticipantTokenModel t) async {
    setState(() => _busyId = t.tokenId);
    try {
      await ref
          .read(adminRepositoryProvider)
          .reissueEventToken(widget.event.id, t.tokenId);
      await _load();
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final all = _tokens;
    final filtered = all == null
        ? null
        : widget.studentId == null
        ? all
        : all.where((t) => t.studentId == widget.studentId).toList();
    final title = widget.studentId == null
        ? 'QR passes · ${widget.event.name}'
        : (filtered != null && filtered.isNotEmpty)
        ? filtered.first.displayName
        : 'QR pass';

    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            icon: const Icon(Icons.refresh),
            onPressed: _load,
          ),
        ],
      ),
      body: AppContentWidth(
        child: _error != null
            ? ErrorBanner(error: _error!, onRetry: _load)
            : filtered == null
            ? const LoadingIndicator(message: 'Loading QR passes…')
            : filtered.isEmpty
            ? const EmptyState(
                icon: Icons.qr_code_2,
                title: 'No QR tokens',
                subtitle: 'Add participants to this event first.',
              )
            : ListView.separated(
                padding: AppListPadding.compact,
                itemCount: filtered.length,
                separatorBuilder: (_, _) => const SizedBox(height: 12),
                itemBuilder: (context, i) {
                  final t = filtered[i];
                  return _TokenCard(
                    token: t,
                    busy: _busyId == t.tokenId,
                    onRevoke: t.isRevoked ? null : () => _revoke(t),
                    onReissue: t.isRevoked ? () => _reissue(t) : null,
                  );
                },
              ),
      ),
    );
  }
}

class _TokenCard extends StatelessWidget {
  const _TokenCard({
    required this.token,
    required this.busy,
    this.onRevoke,
    this.onReissue,
  });

  final EventParticipantTokenModel token;
  final bool busy;
  final VoidCallback? onRevoke;
  final VoidCallback? onReissue;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            if (token.isRevoked)
              const Padding(
                padding: EdgeInsets.only(bottom: 8),
                child: Text(
                  'Revoked',
                  style: TextStyle(
                    color: Colors.red,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            Opacity(
              opacity: token.isRevoked ? 0.35 : 1,
              child: QrImageView(
                data: token.token,
                version: QrVersions.auto,
                size: 220,
                backgroundColor: Colors.white,
                errorCorrectionLevel: QrErrorCorrectLevel.M,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              token.displayName,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            if (token.studentIdCode != null)
              Text(
                token.studentIdCode!,
                style: const TextStyle(fontFamily: 'monospace'),
              ),
            const SizedBox(height: 8),
            if (busy)
              const Padding(
                padding: EdgeInsets.all(8),
                child: CircularProgressIndicator(),
              )
            else
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (onRevoke != null)
                    TextButton.icon(
                      onPressed: onRevoke,
                      icon: const Icon(Icons.block),
                      label: const Text('Revoke'),
                    ),
                  if (onReissue != null)
                    TextButton.icon(
                      onPressed: onReissue,
                      icon: const Icon(Icons.refresh),
                      label: const Text('Reissue'),
                    ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}
