class ProductionRequest {
  final String id;
  final String productId;
  final String productName;
  final String? productSize;
  final String? productColor;
  final int quantity;
  final String unitType;
  final String status;
  final String? salesOrderId;
  final DateTime createdAt;

  ProductionRequest({
    required this.id,
    required this.productId,
    required this.productName,
    this.productSize,
    this.productColor,
    required this.quantity,
    required this.unitType,
    required this.status,
    this.salesOrderId,
    required this.createdAt,
  });

  factory ProductionRequest.fromJson(Map<String, dynamic> json) {
    final product = json['products'] as Map<String, dynamic>?;

    return ProductionRequest(
      id: json['id'],
      productId: json['product_id'],
      productName: product?['name'] ?? 'Unknown Product',
      productSize: product?['size'],
      productColor: product?['color'],
      quantity: json['quantity'] ?? 0,
      unitType: json['unit_type'] ?? 'bundle',
      status: json['status'] ?? 'pending',
      salesOrderId: json['sales_order_id'],
      createdAt: DateTime.parse(json['created_at']),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'product_id': productId,
        'quantity': quantity,
        'unit_type': unitType,
        'status': status,
        'sales_order_id': salesOrderId,
        'created_at': createdAt.toIso8601String(),
      };
}
