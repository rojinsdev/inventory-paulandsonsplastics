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
  final String? orderNumber;
  final DateTime createdAt;
  final int availableStock;
  final bool isSatisfiable;
  final StockSummary? stockSummary;

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
    this.orderNumber,
    required this.createdAt,
    this.availableStock = 0,
    this.isSatisfiable = false,
    this.stockSummary,
  });

  factory ProductionRequest.fromJson(Map<String, dynamic> json) {
    final product = json['products'] as Map<String, dynamic>?;
    final salesOrder = json['sales_order'] as Map<String, dynamic>?;

    String? formattedOrderNumber;
    if (salesOrder != null && salesOrder['order_number'] != null) {
      final id = salesOrder['order_number'].toString();
      formattedOrderNumber = '#${id.split('-').last.toUpperCase().substring(0, 6)}';
    }

    return ProductionRequest(
      id: json['id'],
      productId: json['product_id'],
      productName: product?['name'] ?? 'Unknown Product',
      productSize: product?['size'],
      productColor: product?['color'],
      quantity: ((json['quantity'] ?? 0) as num).toInt(),
      unitType: json['unit_type'] ?? 'bundle',
      status: json['status'] ?? 'pending',
      salesOrderId: json['sales_order_id'],
      orderNumber: formattedOrderNumber,
      createdAt: DateTime.parse(json['created_at']),
      availableStock: ((json['available_stock'] ?? 0) as num).toInt(),
      isSatisfiable: json['is_satisfiable'] ?? false,
      stockSummary: json['stock_summary'] != null 
          ? StockSummary.fromJson(json['stock_summary']) 
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'product_id': productId,
        'quantity': quantity,
        'unit_type': unitType,
        'status': status,
        'sales_order_id': salesOrderId,
        'order_number': orderNumber,
        'created_at': createdAt.toIso8601String(),
        'available_stock': availableStock,
        'is_satisfiable': isSatisfiable,
      };
}

class StockSummary {
  final int loose;
  final int packed;
  final int finished;
  final FactorySpecificStock factorySpecific;

  StockSummary({
    required this.loose,
    required this.packed,
    required this.finished,
    required this.factorySpecific,
  });

  factory StockSummary.fromJson(Map<String, dynamic> json) {
    return StockSummary(
      loose: ((json['loose'] ?? 0) as num).toInt(),
      packed: ((json['packed'] ?? 0) as num).toInt(),
      finished: ((json['finished'] ?? 0) as num).toInt(),
      factorySpecific: FactorySpecificStock.fromJson(json['factory_specific'] ?? {}),
    );
  }
}

class FactorySpecificStock {
  final int loose;
  final int packed;
  final int finished;

  FactorySpecificStock({
    required this.loose,
    required this.packed,
    required this.finished,
  });

  factory FactorySpecificStock.fromJson(Map<String, dynamic> json) {
    return FactorySpecificStock(
      loose: ((json['loose'] ?? 0) as num).toInt(),
      packed: ((json['packed'] ?? 0) as num).toInt(),
      finished: ((json['finished'] ?? 0) as num).toInt(),
    );
  }
}
