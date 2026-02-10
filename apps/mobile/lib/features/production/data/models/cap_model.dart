class Cap {
  final String id;
  final String name;
  final String? color;
  final double idealWeightGrams;
  final double idealCycleTimeSeconds;

  Cap({
    required this.id,
    required this.name,
    this.color,
    required this.idealWeightGrams,
    required this.idealCycleTimeSeconds,
  });

  factory Cap.fromJson(Map<String, dynamic> json) {
    return Cap(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'Unknown',
      color: json['color'] as String?,
      idealWeightGrams: (json['ideal_weight_grams'] as num?)?.toDouble() ?? 0.0,
      idealCycleTimeSeconds:
          (json['ideal_cycle_time_seconds'] as num?)?.toDouble() ?? 0.0,
    );
  }

  String get displayName => color != null ? '$name ($color)' : name;
}
