import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/production/data/models/production_request_model.dart';

void main() {
  group('ProductionRequest.fromJson', () {
    test('parses minimal fields with nested product', () {
      final json = <String, dynamic>{
        'id': 'req-1',
        'product_id': 'p1',
        'quantity': 12,
        'unit_type': 'bundle',
        'status': 'pending',
        'sales_order_id': 'so-1',
        'created_at': '2026-04-10T10:00:00.000Z',
        'products': {'name': 'Widget', 'size': 'M', 'color': 'red'},
      };

      final r = ProductionRequest.fromJson(json);
      expect(r.id, 'req-1');
      expect(r.productId, 'p1');
      expect(r.productName, 'Widget');
      expect(r.productSize, 'M');
      expect(r.productColor, 'red');
      expect(r.quantity, 12);
      expect(r.unitType, 'bundle');
      expect(r.status, 'pending');
      expect(r.salesOrderId, 'so-1');
      expect(r.createdAt.toUtc(), DateTime.parse('2026-04-10T10:00:00.000Z').toUtc());
      expect(r.availableStock, 0);
      expect(r.isSatisfiable, false);
    });

    test('order suffix matches web orders table (last 6 of UUID)', () {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      final json = <String, dynamic>{
        'id': 'r2',
        'created_at': '2026-01-01T00:00:00.000Z',
        'sales_order_id': uuid,
        'sales_order': <String, dynamic>{'id': uuid},
        'products': <String, dynamic>{},
      };

      final r = ProductionRequest.fromJson(json);
      expect(r.orderNumber, '440000');
      expect(ProductionRequest.webOrderSuffixFromId(uuid), '440000');
    });

    test('parses stock_summary and factory_specific', () {
      final json = <String, dynamic>{
        'id': 'r3',
        'created_at': '2026-01-01T00:00:00.000Z',
        'products': <String, dynamic>{'name': 'X'},
        'stock_summary': <String, dynamic>{
          'loose': 1,
          'packed': 2,
          'finished': 3,
          'factory_specific': <String, dynamic>{'loose': 4, 'packed': 5, 'finished': 6},
        },
      };

      final r = ProductionRequest.fromJson(json);
      expect(r.stockSummary, isNotNull);
      expect(r.stockSummary!.loose, 1);
      expect(r.stockSummary!.packed, 2);
      expect(r.stockSummary!.finished, 3);
      expect(r.stockSummary!.factorySpecific.loose, 4);
      expect(r.stockSummary!.factorySpecific.finished, 6);
    });

    test('toJson round-trips core fields', () {
      final r = ProductionRequest(
        id: 'id1',
        productId: 'p',
        productName: 'N',
        quantity: 3,
        unitType: 'loose',
        status: 'pending',
        createdAt: DateTime.utc(2026, 4, 1),
        availableStock: 7,
        isSatisfiable: true,
        isInner: true,
        requiredInnerName: 'Inner A',
      );
      final map = r.toJson();
      expect(map['id'], 'id1');
      expect(map['quantity'], 3);
      expect(map['is_inner'], true);
      expect(map['required_inner_name'], 'Inner A');
    });
  });

  group('StockSummary.fromJson', () {
    test('defaults missing keys to zero', () {
      final s = StockSummary.fromJson({});
      expect(s.loose, 0);
      expect(s.packed, 0);
      expect(s.finished, 0);
      expect(s.factorySpecific.loose, 0);
    });
  });
}
