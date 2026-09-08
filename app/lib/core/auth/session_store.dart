import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// JWT / cached-user persistence.
///
/// Mobile uses [FlutterSecureStorage]. Web uses SharedPreferences because this
/// app is served over LAN HTTP, which is not a browser secure context (Web
/// Crypto / flutter_secure_storage would fail on `http://192.168.x.x`).
class SessionStore {
  SessionStore._();

  static const _secure = FlutterSecureStorage();
  static const _prefix = 'ssc_secure_';

  static Future<String?> read(String key) async {
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getString('$_prefix$key');
    }
    return _secure.read(key: key);
  }

  static Future<void> write(String key, String value) async {
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('$_prefix$key', value);
      return;
    }
    await _secure.write(key: key, value: value);
  }

  static Future<void> delete(String key) async {
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('$_prefix$key');
      return;
    }
    await _secure.delete(key: key);
  }
}
