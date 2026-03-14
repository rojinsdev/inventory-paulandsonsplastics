import 'product_model.dart';

class ProductTemplate {
  final String id;
  final String name;
  final String size;
  final double weightGrams;
  final List<Product> variants;

  ProductTemplate({
    required this.id,
    required this.name,
    required this.size,
    required this.weightGrams,
    this.variants = const [],
  });

  factory ProductTemplate.fromJson(Map<String, dynamic> json) {
    var variantsList = json['variants'] as List? ?? [];
    return ProductTemplate(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'Unknown',
      size: json['size'] as String? ?? '',
      weightGrams: (json['weight_grams'] as num? ?? 0.0).toDouble(),
      variants: variantsList.map((v) => Product.fromJson(v)).toList(),
    );
  }

  String get displayName => "$name ($size)";
}
