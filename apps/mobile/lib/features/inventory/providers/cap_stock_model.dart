class CapStock {
  final String capId;
  final String capName;
  final String? color;
  final int quantity;
  final int idealWeightGrams;

  CapStock({
    required this.capId,
    required this.capName,
    this.color,
    required this.quantity,
    required this.idealWeightGrams,
  });

  factory CapStock.fromJson(Map<String, dynamic> json) {
    final cap = json['caps'] ?? {};
    return CapStock(
      capId: json['cap_id'] ?? '',
      capName: cap['name'] ?? 'Unknown Cap',
      color: cap['color'],
      quantity: ((json['quantity'] ?? 0) as num).toInt(),
      idealWeightGrams: ((cap['ideal_weight_grams'] ?? 0) as num).toInt(),
    );
  }
}
