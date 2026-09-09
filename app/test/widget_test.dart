import 'package:flutter_test/flutter_test.dart';

import 'package:ssc_qr_attendance/core/config/server_settings.dart';

void main() {
  test('parses an IIS host name on port 80', () {
    final s = ServerSettings.parse('attendance.yourschool.edu');
    expect(s?.host, 'attendance.yourschool.edu');
    expect(s?.port, 80);
    expect(s?.https, isFalse);
    expect(s?.baseUrl, 'http://attendance.yourschool.edu');
    expect(s?.display, 'attendance.yourschool.edu');
  });

  test('parses an explicit non-default port', () {
    final s = ServerSettings.parse('attendance.yourschool.edu:8080');
    expect(s?.host, 'attendance.yourschool.edu');
    expect(s?.port, 8080);
    expect(s?.baseUrl, 'http://attendance.yourschool.edu:8080');
    expect(s?.display, 'attendance.yourschool.edu:8080');
  });

  test('parses https URLs', () {
    final s = ServerSettings.parse('https://attendance.local');
    expect(s?.host, 'attendance.local');
    expect(s?.port, 443);
    expect(s?.https, isTrue);
    expect(s?.baseUrl, 'https://attendance.local');
    expect(s?.display, 'attendance.local');
  });
}
