class Product {
  final String id;
  final String name;
  final String size;
  final String color;
  final String sku;
  final String countingMethod; // 'unit_count' or 'weight_based'
  final String? capId;
  final String? templateId;
  final int itemsPerPacket;
  final int packetsPerBundle;
  final int itemsPerBundle;

  Product({
    required this.id,
    required this.name,
    required this.size,
    required this.color,
    required this.sku,
    this.countingMethod = 'unit_count', // Default to unit_count
    this.capId,
    this.templateId,
    this.itemsPerPacket = 0,
    this.packetsPerBundle = 0,
    this.itemsPerBundle = 0,
  });

  factory Product.fromJson(Map<String, dynamic> json) {
    return Product(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'Unknown',
      size: json['size'] as String? ?? '',
      color: json['color'] as String? ?? '',
      sku: json['sku'] as String? ?? '',
      countingMethod: json['counting_method'] as String? ?? 'unit_count',
      capId: json['cap_id'] as String?,
      templateId: json['template_id'] as String?,
      itemsPerPacket: json['items_per_packet'] as int? ?? 0,
      packetsPerBundle: json['packets_per_bundle'] as int? ?? 0,
      itemsPerBundle: json['items_per_bundle'] as int? ?? 0,
    );
  }

  String get displayName => '$name ($size - $color)';
}
