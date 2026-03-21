class Product {
  final String id;
  final String name;
  final String size;
  final String color;
  final String sku;
  final String countingMethod; // 'unit_count' or 'weight_based'
  final double weightGrams;
  final String? capId;
  final String? templateId;
  final int itemsPerPacket;
  final int packetsPerBundle;
  final int itemsPerBundle;
  final int packetsPerBag;
  final int itemsPerBag;
  final int packetsPerBox;
  final int itemsPerBox;
  final bool bundleEnabled;
  final bool bagEnabled;
  final bool boxEnabled;
  final String? capTemplateId;

  Product({
    required this.id,
    required this.name,
    required this.size,
    required this.color,
    required this.sku,
    this.countingMethod = 'unit_count', // Default to unit_count
    this.weightGrams = 0.0,
    this.capId,
    this.templateId,
    this.itemsPerPacket = 0,
    this.packetsPerBundle = 0,
    this.itemsPerBundle = 0,
    this.packetsPerBag = 0,
    this.itemsPerBag = 0,
    this.packetsPerBox = 0,
    this.itemsPerBox = 0,
    this.bundleEnabled = true,
    this.bagEnabled = false,
    this.boxEnabled = false,
    this.capTemplateId,
  });

  factory Product.fromJson(Map<String, dynamic> json) {
    return Product(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'Unknown',
      size: json['size'] as String? ?? '',
      color: json['color'] as String? ?? '',
      sku: json['sku'] as String? ?? '',
      countingMethod: json['counting_method'] as String? ?? 'unit_count',
      weightGrams: (json['weight_grams'] as num? ?? 0.0).toDouble(),
      capId: json['cap_id'] as String?,
      templateId: json['template_id'] as String?,
      itemsPerPacket: json['items_per_packet'] as int? ?? 0,
      packetsPerBundle: json['packets_per_bundle'] as int? ?? 0,
      itemsPerBundle: json['items_per_bundle'] as int? ?? 0,
      packetsPerBag: json['packets_per_bag'] as int? ?? 0,
      itemsPerBag: json['items_per_bag'] as int? ?? 0,
      packetsPerBox: json['packets_per_box'] as int? ?? 0,
      itemsPerBox: json['items_per_box'] as int? ?? 0,
      bundleEnabled: json['bundle_enabled'] as bool? ?? true,
      bagEnabled: json['bag_enabled'] as bool? ?? false,
      boxEnabled: json['box_enabled'] as bool? ?? false,
      capTemplateId: json['cap_template_id'] as String?,
    );
  }

  String get displayName => '$name ($size - $color)';
}
