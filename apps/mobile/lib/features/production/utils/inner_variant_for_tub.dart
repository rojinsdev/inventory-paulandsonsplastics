import 'package:collection/collection.dart';

import '../data/models/inner_template_model.dart';

/// Picks inner variant for a tub: color match to tub, then first variant (same idea as server create_order).
String? resolveInnerVariantIdForTub({
  required List<InnerTemplate> innerTemplates,
  required String? innerTemplateId,
  required String tubColor,
}) {
  if (innerTemplateId == null || innerTemplateId.isEmpty) return null;
  final tpl = innerTemplates.firstWhereOrNull((t) => t.id == innerTemplateId);
  if (tpl == null || tpl.variants.isEmpty) return null;
  final c = tubColor.trim().toLowerCase();
  if (c.isNotEmpty) {
    final m = tpl.variants.firstWhereOrNull(
      (v) => (v.color ?? '').trim().toLowerCase() == c,
    );
    if (m != null) return m.id;
  }
  return tpl.variants.first.id;
}
