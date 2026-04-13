import 'inner_model.dart';

class InnerTemplate {
  final String id;
  final String name;
  final double idealWeightGrams;
  final double idealCycleTimeSeconds;
  final int cavityCount;
  final List<Inner> variants;

  InnerTemplate({
    required this.id,
    required this.name,
    required this.idealWeightGrams,
    this.idealCycleTimeSeconds = 0.0,
    this.cavityCount = 1,
    this.variants = const [],
  });

  factory InnerTemplate.fromJson(Map<String, dynamic> json) {
    var variantsList = json['variants'] as List? ?? [];
    double weight = (json['ideal_weight_grams'] as num? ?? 0.0).toDouble();
    double cycleTime = (json['ideal_cycle_time_seconds'] as num? ?? 0.0).toDouble();
    int cavities = (json['cavity_count'] as num? ?? 1).toInt();

    return InnerTemplate(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'Unknown',
      idealWeightGrams: weight,
      idealCycleTimeSeconds: cycleTime,
      cavityCount: cavities,
      variants: variantsList.map((v) {
        // Inject template values into variant if missing
        if (v is Map<String, dynamic>) {
          v['template'] ??= {
            'name': json['name'],
            'ideal_weight_grams': weight,
            'ideal_cycle_time_seconds': cycleTime,
            'cavity_count': cavities,
          };
        }
        return Inner.fromJson(v);
      }).toList(),
    );
  }

  String get displayName => name;
}
