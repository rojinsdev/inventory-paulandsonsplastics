class Product {
  final String id;
  final String name;
  final String size;
  final String color;
  final String sku;

  Product({
    required this.id,
    required this.name,
    required this.size,
    required this.color,
    required this.sku,
  });

  factory Product.fromJson(Map<String, dynamic> json) {
    return Product(
      id: json['id'] as String,
      name: json['name'] as String,
      size: json['size'] as String,
      color: json['color'] as String,
      sku: json['sku'] as String,
    );
  }

  String get displayName => '$name ($size - $color)';
}
