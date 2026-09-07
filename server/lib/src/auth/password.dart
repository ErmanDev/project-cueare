import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

/// Salted PBKDF2-HMAC-SHA256 password hashing (no extra dependencies).
///
/// Stored format: `pbkdf2$<iterations>$<salt-b64>$<hash-b64>`
class PasswordHasher {
  static const _defaultIterations = 30000;
  static const _keyLength = 32;

  static String hash(String password, {int iterations = _defaultIterations}) {
    final salt = _randomBytes(16);
    final dk = _pbkdf2(utf8.encode(password), salt, iterations, _keyLength);
    return 'pbkdf2\$$iterations\$${base64Encode(salt)}\$${base64Encode(dk)}';
  }

  static bool verify(String password, String stored) {
    final parts = stored.split(r'$');
    if (parts.length != 4 || parts[0] != 'pbkdf2') return false;
    final iterations = int.tryParse(parts[1]);
    if (iterations == null) return false;
    final salt = base64Decode(parts[2]);
    final expected = base64Decode(parts[3]);
    final actual = _pbkdf2(
      utf8.encode(password),
      salt,
      iterations,
      expected.length,
    );
    return _constantTimeEquals(actual, expected);
  }

  static Uint8List _pbkdf2(
    List<int> password,
    List<int> salt,
    int iterations,
    int keyLength,
  ) {
    final hmac = Hmac(sha256, password);
    final hashLen = 32;
    final blocks = (keyLength / hashLen).ceil();
    final out = BytesBuilder(copy: false);

    for (var block = 1; block <= blocks; block++) {
      final blockBytes = Uint8List(4)
        ..buffer.asByteData().setUint32(0, block, Endian.big);
      var u = Uint8List.fromList(
        hmac.convert([...salt, ...blockBytes]).bytes,
      );
      final t = Uint8List.fromList(u);
      for (var i = 1; i < iterations; i++) {
        u = Uint8List.fromList(hmac.convert(u).bytes);
        for (var j = 0; j < t.length; j++) {
          t[j] ^= u[j];
        }
      }
      out.add(t);
    }
    return Uint8List.sublistView(out.toBytes(), 0, keyLength);
  }

  static Uint8List _randomBytes(int n) {
    final rng = Random.secure();
    return Uint8List.fromList(List.generate(n, (_) => rng.nextInt(256)));
  }

  static bool _constantTimeEquals(List<int> a, List<int> b) {
    if (a.length != b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) {
      diff |= a[i] ^ b[i];
    }
    return diff == 0;
  }
}
