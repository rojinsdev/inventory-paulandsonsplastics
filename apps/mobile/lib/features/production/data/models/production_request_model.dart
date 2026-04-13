class ProductionRequest {
  final String id;
  final String? productId;
  final String productName;
  final String? productSize;
  final String? productColor;
  final int quantity;
  final String unitType;
  final String status;
  final String? salesOrderId;
  /// Last 6 chars of sales order UUID, uppercase — matches web orders table (`order.id.slice(-6)`).
  final String? orderNumber;
  final DateTime createdAt;
  final int availableStock;
  final bool isSatisfiable;
  final StockSummary? stockSummary;
  final bool isInner;
  final String? requiredInnerName;
  final String? capName;
  final String? capColor;
  /// From sales order line: customer wants inner in the product (false = without inner).
  final bool includeInner;

  ProductionRequest({
    required this.id,
    this.productId,
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
    this.isInner = false,
    this.requiredInnerName,
    this.capName,
    this.capColor,
    this.includeInner = true,
  });

  /// Same short label as web `#{order.id.slice(-6).toUpperCase()}` (no `#` prefix).
  static String webOrderSuffixFromId(String? orderId) {
    if (orderId == null || orderId.isEmpty) return '';
    final s = orderId.trim();
    if (s.length < 6) return s.toUpperCase();
    return s.substring(s.length - 6).toUpperCase();
  }

  factory ProductionRequest.fromJson(Map<String, dynamic> json) {
    final product = json['products'] as Map<String, dynamic>?;
    final salesOrder = json['sales_order'] as Map<String, dynamic>?;
    final caps = json['caps'] as Map<String, dynamic>?;

    final orderUuid = salesOrder?['id']?.toString() ??
        salesOrder?['order_number']?.toString() ??
        json['sales_order_id']?.toString();
    final suffix = webOrderSuffixFromId(orderUuid);
    final formattedOrderNumber = suffix.isEmpty ? null : suffix;

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
      isInner: json['is_inner'] ?? false,
      requiredInnerName: json['required_inner_name'] as String?,
      capName: caps?['name']?.toString(),
      capColor: caps?['color']?.toString(),
      includeInner: json['include_inner'] != false,
    );
  }

  /// Same inclusion rule as [ProductionRequestsScreen] (excludes terminal states).
  bool get showsInRequestsList {
    const terminal = {'completed', 'prepared', 'cancelled'};
    return !terminal.contains(status);
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'product_id': productId,
        'quantity': quantity,
        'unit_type': unitType,
        'status': status,
        'sales_order_id': salesOrderId,
        'order_number': orderNumber,
        'cap_name': capName,
        'cap_color': capColor,
        'created_at': createdAt.toIso8601String(),
        'available_stock': availableStock,
        'is_satisfiable': isSatisfiable,
        'is_inner': isInner,
        'required_inner_name': requiredInnerName,
        'include_inner': includeInner,
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
