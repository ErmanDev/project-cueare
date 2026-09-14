import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../models/user_model.dart';
import '../api/api_client.dart';
import '../api/api_endpoints.dart';
import 'auth_token.dart';
import 'session_store.dart';

/// Who is using the app right now.
sealed class AuthSession {
  const AuthSession();
}

/// Nobody logged in.
class SignedOut extends AuthSession {
  const SignedOut();
}

/// Staff (superadmin / moderator) with a JWT.
class StaffSession extends AuthSession {
  const StaffSession({required this.user, required this.token});
  final UserModel user;
  final String token;
  UserRole get role => user.role;
}

/// A student signed in with student ID as username and password.
class StudentSession extends AuthSession {
  const StudentSession({required this.studentIdCode});
  final String studentIdCode;
}

class AuthNotifier extends AsyncNotifier<AuthSession> {
  static const _tokenKey = 'auth_token';
  static const _userKey = 'auth_user_json';
  static const _studentKey = 'student_code';

  @override
  Future<AuthSession> build() async {
    // If the API client sees a 401 it clears the in-memory token; bounce the
    // user to the login screen when that happens.
    ref.listen<String?>(authTokenProvider, (previous, next) {
      if (previous != null && next == null && state.value is! SignedOut) {
        _clearStaff();
        state = const AsyncData(SignedOut());
      }
    });

    final prefs = await SharedPreferences.getInstance();
    final studentCode = prefs.getString(_studentKey);
    if (studentCode != null && studentCode.isNotEmpty) {
      final liveToken = ref.read(authTokenProvider);
      final token = liveToken ?? await SessionStore.read(_tokenKey);
      if (liveToken == null && token != null && token.isNotEmpty) {
        ref.read(authTokenProvider.notifier).set(token);
      }
      return StudentSession(studentIdCode: studentCode);
    }

    final liveToken = ref.read(authTokenProvider);
    final token = liveToken ?? await SessionStore.read(_tokenKey);
    if (token == null || token.isEmpty) return const SignedOut();

    // Restore the cached user immediately, then validate against the server
    // in the background (handles expired tokens / deleted accounts).
    final userJson = await SessionStore.read(_userKey);
    UserModel? user;
    if (userJson != null) {
      try {
        user = UserModel.fromJson(_decode(userJson));
      } catch (_) {
        user = null;
      }
    }
    if (liveToken == null) {
      ref.read(authTokenProvider.notifier).set(token);
    }
    if (user == null) {
      // No cached user — must validate now.
      try {
        final api = ref.read(apiClientProvider);
        final me = await api.getJson(ApiEndpoints.me);
        user = UserModel.fromJson(me['user'] as Map<String, dynamic>);
        await SessionStore.write(_userKey, _encode(user));
      } catch (_) {
        await _clearStaff();
        return const SignedOut();
      }
    }
    return StaffSession(user: user, token: token);
  }

  /// Staff username/password, or student ID as both username and password.
  Future<void> login(String username, String password) async {
    final api = ref.read(apiClientProvider);
    final res = await api.postJson(ApiEndpoints.login, {
      'username': username.trim(),
      'password': password,
    });
    final role = res['role'] as String?;
    if (role == 'student') {
      final student = res['student'] as Map<String, dynamic>?;
      final user = res['user'] as Map<String, dynamic>?;
      final code =
          (student?['student_id_code'] as String?) ??
          (user?['username'] as String?) ??
          username.trim();
      final token = res['token'] as String?;
      await _clearStaff();
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_studentKey, code);
      if (token != null && token.isNotEmpty) {
        await SessionStore.write(_tokenKey, token);
        ref.read(authTokenProvider.notifier).set(token);
      } else {
        ref.read(authTokenProvider.notifier).set(null);
      }
      state = AsyncData(StudentSession(studentIdCode: code));
      return;
    }
    final token = res['token'] as String;
    final user = UserModel.fromJson(res['user'] as Map<String, dynamic>);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_studentKey);
    await SessionStore.write(_tokenKey, token);
    await SessionStore.write(_userKey, _encode(user));
    ref.read(authTokenProvider.notifier).set(token);
    state = AsyncData(StaffSession(user: user, token: token));
  }

  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    final api = ref.read(apiClientProvider);
    await api.postJson(ApiEndpoints.changePassword, {
      'current_password': currentPassword,
      'new_password': newPassword,
    });
  }

  Future<void> signOut() async {
    await _clearStaff();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_studentKey);
    ref.read(authTokenProvider.notifier).set(null);
    state = const AsyncData(SignedOut());
  }

  Future<void> _clearStaff() async {
    await SessionStore.delete(_tokenKey);
    await SessionStore.delete(_userKey);
  }

  static String _encode(UserModel u) =>
      '${u.id}|${u.role.name}|${u.username}|${u.name}';

  static Map<String, dynamic> _decode(String s) {
    final parts = s.split('|');
    return {
      'id': int.parse(parts[0]),
      'role': parts[1],
      'username': parts[2],
      'name': parts.sublist(3).join('|'),
    };
  }
}

final authProvider = AsyncNotifierProvider<AuthNotifier, AuthSession>(
  AuthNotifier.new,
);

/// Convenience: the current staff user, or null.
final currentUserProvider = Provider<UserModel?>((ref) {
  final session = ref.watch(authProvider).value;
  return session is StaffSession ? session.user : null;
});
