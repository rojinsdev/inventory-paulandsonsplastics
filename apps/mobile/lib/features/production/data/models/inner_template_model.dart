import 'inner_model.dart';

class InnerTemplate {
  final String id;
  final String name;
  final double idealWeightGrams;
  final List<Inner> variants;

  InnerTemplate({
    required this.id,
    required this.name,
    required this.idealWeightGrams,
    this.variants = const [],
  });

  factory InnerTemplate.fromJson(Map<String, dynamic> json) {
    var variantsList = json['variants'] as List? ?? [];
    return InnerTemplate(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'Unknown',
      idealWeightGrams: (json['ideal_weight_grams'] as num? ?? 0.0).toDouble(),
      variants: variantsList.map((v) => Inner.fromJson(v)).toList(),
    );
  }

  String get displayName => name;
}
