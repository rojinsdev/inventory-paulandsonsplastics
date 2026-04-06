class InnerStock {
  final String innerId;
  final String innerName;
  final String? color;
  final int quantity;
  final double idealWeightGrams;

  InnerStock({
    required this.innerId,
    required this.innerName,
    this.color,
    required this.quantity,
    required this.idealWeightGrams,
  });

  factory InnerStock.fromJson(Map<String, dynamic> json) {
    final inner = json['inners'] ?? {};
    final template = inner['inner_templates'] ?? {};
    return InnerStock(
      innerId: json['inner_id'] ?? '',
      innerName: template['name'] ?? 'Unknown Inner',
      color: inner['color'],
      quantity: ((json['quantity'] ?? 0) as num).toInt(),
      idealWeightGrams: ((template['ideal_weight_grams'] ?? 0) as num).toDouble(),
    );
  }
}
