class SalesOrderItem {
  final String id;
  final String orderId;
  final String customerName;
  final String productName;
  final String? productSize;
  final String? productColor;
  final int quantity;
  final String unitType;
  final bool isPrepared;
  final bool isBackordered;
  final DateTime? preparedAt;
  final DateTime? deliveryDate;
  final String? notes;

  SalesOrderItem({
    required this.id,
    required this.orderId,
    required this.customerName,
    required this.productName,
    this.productSize,
    this.productColor,
    required this.quantity,
    required this.unitType,
    required this.isPrepared,
    required this.isBackordered,
    this.preparedAt,
    this.deliveryDate,
    this.notes,
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
    final customer = _unwrapJoin(orderJson['customers']);

    return SalesOrderItem(
      id: (itemJson['id'] ?? '') as String,
      orderId: (orderJson['id'] ?? '') as String,
      customerName: customer?['name'] ?? 'Unknown Customer',
      productName: product?['name'] ?? 'Unknown Product',
      productSize: product?['size'] as String?,
      productColor: product?['color'] as String?,
      quantity: ((itemJson['quantity'] ?? 0) as num).toInt(),
      unitType: (itemJson['unit_type'] ?? 'bundle') as String,
      isPrepared: itemJson['is_prepared'] ?? false,
      isBackordered: itemJson['is_backordered'] ?? false,
      preparedAt: itemJson['prepared_at'] != null
          ? DateTime.parse(itemJson['prepared_at'])
          : null,
      deliveryDate: orderJson['delivery_date'] != null
          ? DateTime.parse(orderJson['delivery_date'] as String)
          : null,
      notes: orderJson['notes'] as String?,
    );
  }
}
