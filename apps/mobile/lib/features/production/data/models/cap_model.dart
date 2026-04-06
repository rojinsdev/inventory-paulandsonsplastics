class Cap {
  final String id;
  final String name;
  final String? color;
  final double idealWeightGrams;
  final double idealCycleTimeSeconds;
  final int stockQuantity;
  final String? templateId;

  Cap({
    required this.id,
    required this.name,
    this.color,
    required this.idealWeightGrams,
    required this.idealCycleTimeSeconds,
    this.stockQuantity = 0,
    this.templateId,
  });

  factory Cap.fromJson(Map<String, dynamic> json) {
    // Handle the join structure from Superbase
    final stockField = json['stock'];
    int stock = 0;
    if (stockField != null) {
      if (stockField is List && stockField.isNotEmpty) {
        stock = (stockField[0]['quantity'] as num?)?.toInt() ?? 0;
      } else if (stockField is Map) {
        stock = (stockField['quantity'] as num?)?.toInt() ?? 0;
      }
    }

    // Helper for robust double parsing
    double parseDouble(dynamic value) {
      if (value == null) return 0.0;
      if (value is num) return value.toDouble();
      if (value is String) return double.tryParse(value) ?? 0.0;
      return 0.0;
    }

    return Cap(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'Unknown',
      color: json['color'] as String?,
      idealWeightGrams: parseDouble(json['ideal_weight_grams']),
      idealCycleTimeSeconds: parseDouble(json['ideal_cycle_time_seconds']),
      stockQuantity: stock,
      templateId: json['template_id'] as String?,
    );
  }

  String get displayName => color != null ? '$name ($color)' : name;
}
