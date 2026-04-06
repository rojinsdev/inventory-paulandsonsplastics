class ProductionHistoryModel {
  final String id;
  final DateTime timestamp;
  final String userId;
  final String userName;
  final String actionType;
  final String itemType;
  final String itemName;
  final double quantity;
  final String unit;
  final String? factoryId;
  final String? factoryName;

  ProductionHistoryModel({
    required this.id,
    required this.timestamp,
    required this.userId,
    required this.userName,
    required this.actionType,
    required this.itemType,
    required this.itemName,
    required this.quantity,
    required this.unit,
    this.factoryId,
    this.factoryName,
  });

  factory ProductionHistoryModel.fromJson(Map<String, dynamic> json) {
    return ProductionHistoryModel(
      id: json['id']?.toString() ?? '',
      timestamp: json['timestamp'] != null 
          ? DateTime.parse(json['timestamp']) 
          : DateTime.now(),
      userId: json['user_id']?.toString() ?? '',
      userName: json['user_name'] ?? 'System',
      actionType: json['action_type']?.toString() ?? 'unknown',
      itemType: json['item_type']?.toString() ?? 'unknown',
      itemName: json['item_name']?.toString() ?? 'Unknown Item',
      quantity: (json['quantity'] as num?)?.toDouble() ?? 0.0,
      unit: json['unit']?.toString() ?? '',
      factoryId: json['factory_id']?.toString(),
      factoryName: json['factory_name']?.toString(),
    );
  }
}

class ProductionHistoryResponse {
  final List<ProductionHistoryModel> logs;
  final int total;
  final int page;
  final int totalPages;

  ProductionHistoryResponse({
    required this.logs,
    required this.total,
    required this.page,
    required this.totalPages,
  });

  factory ProductionHistoryResponse.fromJson(Map<String, dynamic> json) {
    final pagination = json['pagination'] ?? {};
    return ProductionHistoryResponse(
      logs: (json['logs'] as List?)
          ?.map((item) => ProductionHistoryModel.fromJson(item))
          .toList() ?? [],
      total: (pagination['total'] as num?)?.toInt() ?? 0,
      page: (pagination['page'] as num?)?.toInt() ?? 1,
      totalPages: (pagination['totalPages'] as num?)?.toInt() ?? 1,
    );
  }
}
