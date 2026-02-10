class RawMaterial {
  final String id;
  final String name;
  final double stockWeightKg;

  RawMaterial({
    required this.id,
    required this.name,
    required this.stockWeightKg,
  });

  factory RawMaterial.fromJson(Map<String, dynamic> json) {
    return RawMaterial(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'Unknown',
      stockWeightKg: (json['stock_weight_kg'] ?? 0).toDouble(),
    );
  }
}
