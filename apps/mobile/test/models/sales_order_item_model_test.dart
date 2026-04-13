import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/production/data/models/sales_order_item_model.dart';

void main() {
  group('SalesOrderItem.fromOrderJson', () {
    test('parses tub line with product map join and cap_id', () {
      final order = <String, dynamic>{
        'id': 'ord-1',
        'delivery_date': '2026-04-15',
        'order_number': 'ON-1',
        'notes': 'n1',
        'customer': {'name': 'Acme Ltd'},
        'production_requests': <dynamic>[],
      };
      final item = <String, dynamic>{
        'id': 'it-1',
        'product_id': 'p1',
        'cap_id': 'c1',
        'quantity': 24,
        'unit_type': 'bundle',
        'is_prepared': false,
        'is_backordered': true,
        'include_inner': true,
        'inner_id': 'in-1',
        'quantity_prepared': 0,
        'quantity_reserved': 0,
        'quantity_shipped': 0,
        'products': {
          'name': 'Tub A',
          'size': '5L',
          'color': 'white',
        },
      };

      final model = SalesOrderItem.fromOrderJson(order, item);

      expect(model.id, 'it-1');
      expect(model.orderId, 'ord-1');
      expect(model.productId, 'p1');
      expect(model.capId, 'c1');
      expect(model.itemType, 'cap'); // implementation uses cap_id != null => 'cap'
      expect(model.customerName, 'Acme Ltd');
      expect(model.productName, 'Tub A');
      expect(model.productSize, '5L');
      expect(model.productColor, 'white');
      expect(model.quantity, 24);
      expect(model.unitType, 'bundle');
      expect(model.isBackordered, true);
      expect(model.includeInner, true);
      expect(model.innerId, 'in-1');
      expect(model.deliveryDate, DateTime.parse('2026-04-15'));
    });

    test('unwraps products when API returns a single-element list', () {
      final order = <String, dynamic>{
        'id': 'o2',
        'customer': {'name': 'B'},
        'production_requests': <dynamic>[],
      };
      final item = <String, dynamic>{
        'id': 'i2',
        'product_id': 'p2',
        'quantity': 1,
        'unit_type': 'loose',
        'is_prepared': false,
        'is_backordered': false,
        'quantity_prepared': 0,
        'quantity_reserved': 0,
        'quantity_shipped': 0,
        'products': [
          {'name': 'FromList', 'size': '1L', 'color': 'blue'},
        ],
      };

      final m = SalesOrderItem.fromOrderJson(order, item);
      expect(m.productName, 'FromList');
      expect(m.itemType, 'product');
    });

    test('matches production_requests by product_id and inner_id', () {
      final order = <String, dynamic>{
        'id': 'o3',
        'customer': {'name': 'C'},
        'production_requests': [
          {
            'product_id': 'px',
            'inner_id': 'ix',
            'status': 'prepared',
          },
          {
            'product_id': 'px',
            'inner_id': null,
            'status': 'pending',
          },
        ],
      };
      final item = <String, dynamic>{
        'id': 'i3',
        'product_id': 'px',
        'inner_id': 'ix',
        'quantity': 5,
        'unit_type': 'bundle',
        'is_prepared': false,
        'is_backordered': true,
        'quantity_prepared': 0,
        'quantity_reserved': 0,
        'quantity_shipped': 0,
      };

      final m = SalesOrderItem.fromOrderJson(order, item);
      expect(m.productionStatus, 'prepared');
    });

    test('cap-only line uses cap name when product absent', () {
      final order = <String, dynamic>{
        'id': 'o4',
        'customers': {'name': 'D'},
        'production_requests': <dynamic>[],
      };
      final item = <String, dynamic>{
        'id': 'i4',
        'cap_id': 'capz',
        'quantity': 10,
        'unit_type': 'loose',
        'is_prepared': false,
        'is_backordered': false,
        'quantity_prepared': 0,
        'quantity_reserved': 0,
        'quantity_shipped': 0,
        'caps': {'name': 'Blue Cap'},
      };

      final m = SalesOrderItem.fromOrderJson(order, item);
      expect(m.itemType, 'cap');
      expect(m.productName, 'Blue Cap');
    });
  });
}
