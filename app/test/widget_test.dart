import 'package:flutter_test/flutter_test.dart';

import 'package:ssc_qr_attendance/core/config/server_settings.dart';

void main() {
  test('parses LAN server addresses', () {
    final s = ServerSettings.parse('192.168.1.10:8080');
    expect(s?.host, '192.168.1.10');
    expect(s?.port, 8080);
    expect(s?.https, isFalse);
    expect(s?.baseUrl, 'http://192.168.1.10:8080');
  });

  test('parses https URLs', () {
    final s = ServerSettings.parse('https://attendance.local');
    expect(s?.host, 'attendance.local');
    expect(s?.port, 443);
    expect(s?.https, isTrue);
    expect(s?.baseUrl, 'https://attendance.local');
  });
}
