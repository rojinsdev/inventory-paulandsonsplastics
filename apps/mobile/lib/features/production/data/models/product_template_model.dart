import 'product_model.dart';

class ProductTemplate {
  final String id;
  final String name;
  final String size;
  final double weightGrams;
  final List<Product> variants;
  final bool bundleEnabled;
  final bool bagEnabled;
  final bool boxEnabled;
  final int? packetsPerBundle;
  final int? itemsPerBundle;
  final int? packetsPerBag;
  final int? itemsPerBag;
  final int? packetsPerBox;
  final int? itemsPerBox;
  final String? rawMaterialId;
  final double? sellingPrice;
  /// Default cap template for this tub (from web product template mapping).
  final String? capTemplateId;
  /// Default inner template for this tub (from web product template mapping).
  final String? innerTemplateId;

  ProductTemplate({
    required this.id,
    required this.name,
    required this.size,
    required this.weightGrams,
    this.variants = const [],
    this.bundleEnabled = true,
    this.bagEnabled = false,
    this.boxEnabled = false,
    this.packetsPerBundle,
    this.itemsPerBundle,
    this.packetsPerBag,
    this.itemsPerBag,
    this.packetsPerBox,
    this.itemsPerBox,
    this.rawMaterialId,
    this.sellingPrice,
    this.capTemplateId,
    this.innerTemplateId,
  });

  factory ProductTemplate.fromJson(Map<String, dynamic> json) {
    var variantsList = json['variants'] as List? ?? [];
    final capTpl = json['cap_template'];
    final capFromJoin = capTpl is Map<String, dynamic>
        ? capTpl['id'] as String?
        : null;
    return ProductTemplate(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'Unknown',
      size: json['size'] as String? ?? '',
      weightGrams: (json['weight_grams'] as num? ?? 0.0).toDouble(),
      variants: variantsList.map((v) => Product.fromJson(v)).toList(),
      bundleEnabled: json['bundle_enabled'] as bool? ?? true,
      bagEnabled: json['bag_enabled'] as bool? ?? false,
      boxEnabled: json['box_enabled'] as bool? ?? false,
      packetsPerBundle: json['packets_per_bundle'] as int?,
      itemsPerBundle: json['items_per_bundle'] as int?,
      packetsPerBag: json['packets_per_bag'] as int?,
      itemsPerBag: json['items_per_bag'] as int?,
      packetsPerBox: json['packets_per_box'] as int?,
      itemsPerBox: json['items_per_box'] as int?,
      rawMaterialId: json['raw_material_id'] as String?,
      sellingPrice: (json['selling_price'] as num?)?.toDouble(),
      capTemplateId:
          json['cap_template_id'] as String? ?? capFromJoin,
      innerTemplateId: json['inner_template_id'] as String?,
    );
  }

  String get displayName => "$name ($size)";
}
