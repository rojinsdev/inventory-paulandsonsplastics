import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/api/api_client.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('ApiClient.getFactoryId', () {
    test('returns null when user_data is absent', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final client = ApiClient(prefs);
      addTearDown(client.dispose);

      expect(await client.getFactoryId(), isNull);
    });

    test('returns factory_id from valid JSON', () async {
      SharedPreferences.setMockInitialValues({
        'user_data': '{"factory_id":"fac-uuid-1","email":"a@b.com"}',
      });
      final prefs = await SharedPreferences.getInstance();
      final client = ApiClient(prefs);
      addTearDown(client.dispose);

      expect(await client.getFactoryId(), 'fac-uuid-1');
    });

    test('returns null on malformed JSON', () async {
      SharedPreferences.setMockInitialValues({
        'user_data': 'not-json',
      });
      final prefs = await SharedPreferences.getInstance();
      final client = ApiClient(prefs);
      addTearDown(client.dispose);

      expect(await client.getFactoryId(), isNull);
    });

    test('returns null when factory_id key missing', () async {
      SharedPreferences.setMockInitialValues({
        'user_data': '{"email":"x@y.com"}',
      });
      final prefs = await SharedPreferences.getInstance();
      final client = ApiClient(prefs);
      addTearDown(client.dispose);

      expect(await client.getFactoryId(), isNull);
    });
  });
}
