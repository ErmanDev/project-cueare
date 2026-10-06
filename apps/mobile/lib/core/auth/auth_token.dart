import 'package:flutter_riverpod/flutter_riverpod.dart';

/// In-memory copy of the JWT so the API client can read it synchronously.
/// Persistence lives in [AuthNotifier] / [SessionStore].
class AuthTokenNotifier extends Notifier<String?> {
  @override
  String? build() => null;

  void set(String? token) => state = token;

  /// Called by the API client on a 401 — drops the token so the role gate
  /// bounces the user back to the login screen.
  void expire() {
    if (state != null) state = null;
  }
}

final authTokenProvider = NotifierProvider<AuthTokenNotifier, String?>(
  AuthTokenNotifier.new,
);
