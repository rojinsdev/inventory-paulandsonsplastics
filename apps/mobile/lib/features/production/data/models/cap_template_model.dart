import 'cap_model.dart';

class CapTemplate {
  final String id;
  final String name;
  final double weightGrams;
  final List<Cap> variants;

  CapTemplate({
    required this.id,
    required this.name,
    required this.weightGrams,
    this.variants = const [],
  });

  factory CapTemplate.fromJson(Map<String, dynamic> json) {
    var variantsList = json['variants'] as List? ?? [];
    return CapTemplate(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'Unknown',
      weightGrams: (json['weight_grams'] as num? ?? 0.0).toDouble(),
      variants: variantsList.map((v) => Cap.fromJson(v)).toList(),
    );
  }

  String get displayName => name;
}
