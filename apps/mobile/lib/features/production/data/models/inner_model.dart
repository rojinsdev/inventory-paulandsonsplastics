class Inner {
  final String id;
  final String name;
  final String? color;
  final double idealWeightGrams;
  final double idealCycleTimeSeconds;
  final int stockQuantity;
  final String? templateId;

  Inner({
    required this.id,
    required this.name,
    this.color,
    required this.idealWeightGrams,
    required this.idealCycleTimeSeconds,
    this.stockQuantity = 0,
    this.templateId,
  });

  factory Inner.fromJson(Map<String, dynamic> json) {
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

    // Try to get name from template if not present directly (usually in variants)
    String name = json['name'] as String? ?? 'Unknown';
    if (name == 'Unknown' && json['template'] != null) {
      name = json['template']['name'] as String? ?? 'Unknown';
    }

    // Try to get weights/times from template if not present on variant
    double weight = (json['ideal_weight_grams'] as num?)?.toDouble() ?? 0.0;
    if (weight == 0.0 && json['template'] != null) {
      weight = (json['template']['ideal_weight_grams'] as num?)?.toDouble() ?? 0.0;
    }

    double cycleTime = (json['ideal_cycle_time_seconds'] as num?)?.toDouble() ?? 0.0;
    if (cycleTime == 0.0 && json['template'] != null) {
      cycleTime = (json['template']['ideal_cycle_time_seconds'] as num?)?.toDouble() ?? 0.0;
    }

    return Inner(
      id: json['id'] as String? ?? '',
      name: name,
      color: json['color'] as String?,
      idealWeightGrams: weight,
      idealCycleTimeSeconds: cycleTime,
      stockQuantity: stock,
      templateId: json['template_id'] as String?,
    );
  }

  String get displayName => color != null && color!.isNotEmpty ? '$name ($color)' : name;
}
