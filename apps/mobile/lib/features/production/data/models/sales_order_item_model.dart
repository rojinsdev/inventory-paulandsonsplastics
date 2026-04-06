class SalesOrderItem {
  final String id;
  final String orderId;
  final String customerName;
  final String? productId;
  final String? capId;
  final String itemType; // 'product' or 'cap'
  final String? productName;
  final String? productSize;
  final String? productColor;
  final int quantity;
  final String unitType;
  final bool isPrepared;
  final bool isBackordered;
  final bool includeInner;
  final String? innerId;
  final int quantityPrepared;
  final int quantityReserved;
  final int quantityShipped;
  final DateTime? preparedAt;
  final DateTime? deliveryDate;
  final String? orderNumber;
  final String? notes;
  final String? productionStatus;

  SalesOrderItem({
    required this.id,
    required this.orderId,
    required this.customerName,
    this.productId,
    this.capId,
    required this.itemType,
    this.productName,
    this.productSize,
    this.productColor,
    required this.quantity,
    required this.unitType,
    required this.isPrepared,
    required this.isBackordered,
    this.includeInner = false,
    this.innerId,
    required this.quantityPrepared,
    required this.quantityReserved,
    required this.quantityShipped,
    this.preparedAt,
    this.deliveryDate,
    this.orderNumber,
    this.notes,
    this.productionStatus,
  });

  static Map<String, dynamic>? _unwrapJoin(dynamic data) {
    if (data == null) return null;
    if (data is Map<String, dynamic>) return data;
    if (data is List && data.isNotEmpty) {
      return data.first as Map<String, dynamic>;
    }
    return null;
  }

  factory SalesOrderItem.fromOrderJson(
      Map<String, dynamic> orderJson, Map<String, dynamic> itemJson) {
    final product = _unwrapJoin(itemJson['products']);
    final cap = _unwrapJoin(itemJson['caps']);
    
    final customer = _unwrapJoin(orderJson['customer'] ?? 
                             orderJson['customers'] ?? 
                             itemJson['sales_orders']?['customer'] ?? 
                             itemJson['sales_orders']?['customers']);

    final productionRequests = orderJson['production_requests'];
    String? prodStatus;
    if (productionRequests is List && productionRequests.isNotEmpty) {
      final productId = itemJson['product_id'];
      final capId = itemJson['cap_id'];
      final innerId = itemJson['inner_id'];
      try {
        final req = productionRequests.firstWhere(
          (r) => (productId != null && r['product_id'] == productId && r['inner_id'] == innerId) ||
                 (capId != null && r['cap_id'] == capId),
        );
        prodStatus = req['status'] as String?;
      } catch (_) {
        // No matching request found
      }
    }

    final String itemType = itemJson['cap_id'] != null ? 'cap' : 'product';

    return SalesOrderItem(
      id: (itemJson['id'] ?? '') as String,
      orderId: (orderJson['id'] ?? '') as String,
      productId: itemJson['product_id'] as String?,
      capId: itemJson['cap_id'] as String?,
      itemType: itemType,
      customerName: customer?['name'] ?? 'Unknown Customer',
      productName: (product?['name'] ?? cap?['name'] ?? 'Unknown Resource') as String?,
      productSize: product?['size'] as String?,
      productColor: product?['color'] as String?,
      quantity: ((itemJson['quantity'] ?? 0) as num).toInt(),
      quantityPrepared: ((itemJson['quantity_prepared'] ?? 0) as num).toInt(),
      quantityReserved: ((itemJson['quantity_reserved'] ?? 0) as num).toInt(),
      quantityShipped: ((itemJson['quantity_shipped'] ?? 0) as num).toInt(),
      unitType: (itemJson['unit_type'] ?? 'bundle') as String,
      isPrepared: itemJson['is_prepared'] ?? false,
      isBackordered: itemJson['is_backordered'] ?? false,
      includeInner: itemJson['include_inner'] ?? false,
      innerId: itemJson['inner_id'] as String?,
      preparedAt: itemJson['prepared_at'] != null
          ? DateTime.parse(itemJson['prepared_at'])
          : null,
      deliveryDate: orderJson['delivery_date'] != null
          ? DateTime.parse(orderJson['delivery_date'] as String)
          : null,
      orderNumber: (orderJson['order_number'] ?? '') as String?,
      notes: orderJson['notes'] as String?,
      productionStatus: prodStatus,
    );
  }
}
