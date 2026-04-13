import '../data/models/cap_template_model.dart';
import '../data/models/product_template_model.dart';

/// Caps shown for packing/bundling: if the tub template has a [ProductTemplate.capTemplateId]
/// from the web catalog, only that cap template is listed; otherwise all factory caps are shown.
List<CapTemplate> capTemplatesForSelectedTub({
  ProductTemplate? tubTemplate,
  required List<CapTemplate> allCapTemplates,
}) {
  if (tubTemplate == null) return List<CapTemplate>.from(allCapTemplates);
  final mappedId = tubTemplate.capTemplateId;
  if (mappedId == null || mappedId.isEmpty) {
    return List<CapTemplate>.from(allCapTemplates);
  }
  return allCapTemplates.where((c) => c.id == mappedId).toList();
}
