class Product {
  final String id;
  final String name;
  final String size;
  final String color;
  final String sku;
  final String countingMethod; // 'unit_count' or 'weight_based'

  Product({
    required this.id,
    required this.name,
    required this.size,
    required this.color,
    required this.sku,
    this.countingMethod = 'unit_count', // Default to unit_count
  });

  factory Product.fromJson(Map<String, dynamic> json) {
    return Product(
      id: json['id'] as String,
      name: json['name'] as String,
      size: json['size'] as String,
      color: json['color'] as String,
      sku: json['sku'] as String,
      countingMethod: json['counting_method'] as String? ?? 'unit_count',
    );
  }

  String get displayName => '$name ($size - $color)';
}
