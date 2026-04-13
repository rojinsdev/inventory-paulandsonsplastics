import 'package:flutter/material.dart';
import 'package:collection/collection.dart';
import '../../production/data/models/product_model.dart';
import '../../production/data/models/product_template_model.dart';

Product? resolveSelectedProduct(
  List<ProductTemplate> templates,
  String? templateId,
  String? variantId,
) {
  if (templateId == null || variantId == null) return null;
  final t = templates.firstWhereOrNull((x) => x.id == templateId);
  return t?.variants.firstWhereOrNull((v) => v.id == variantId);
}

String _unitLabel(String unitType) {
  switch (unitType) {
    case 'box':
      return 'box';
    case 'bag':
      return 'bag';
    default:
      return 'bundle';
  }
}

int _itemsPerPacket(Product p) => p.itemsPerPacket > 0 ? p.itemsPerPacket : 12;

/// Matches server `bundlePackets` fallbacks (inventory.service.ts).
int _packetsPerOutputUnit(Product p, String unitType) {
  switch (unitType) {
    case 'box':
      return p.packetsPerBox > 0 ? p.packetsPerBox : 50;
    case 'bag':
      return p.packetsPerBag > 0 ? p.packetsPerBag : 50;
    default:
      return p.packetsPerBundle > 0 ? p.packetsPerBundle : 50;
  }
}

int _itemsPerOutputUnit(Product p, String unitType) {
  switch (unitType) {
    case 'box':
      return p.itemsPerBox > 0 ? p.itemsPerBox : 600;
    case 'bag':
      return p.itemsPerBag > 0 ? p.itemsPerBag : 600;
    default:
      return p.itemsPerBundle > 0 ? p.itemsPerBundle : 600;
  }
}

/// Shown on packing: loose items per packet from product row.
class PackingConversionHint extends StatelessWidget {
  final Product product;
  final TextEditingController quantityController;

  const PackingConversionHint({
    super.key,
    required this.product,
    required this.quantityController,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final ipp = _itemsPerPacket(product);
    final n = int.tryParse(quantityController.text.trim());

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: cs.secondaryContainer.withValues(alpha: 0.45),
        border: Border.all(
          color: cs.outlineVariant.withValues(alpha: 0.4),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.straighten, size: 20, color: cs.onSecondaryContainer),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Conversion (product settings)',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: cs.onSecondaryContainer,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            '1 packet = $ipp loose items',
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          Text(
            'Loose = semi-finished tub items in stock.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: cs.onSurfaceVariant,
            ),
          ),
          if (n != null && n > 0) ...[
            const SizedBox(height: 8),
            Text(
              'This entry: $n packets → ${n * ipp} loose items deducted',
              style: theme.textTheme.bodySmall?.copyWith(
                color: cs.primary,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Shown on bundling: packets or loose required per bundle/bag/box.
class BundlingConversionHint extends StatelessWidget {
  final Product product;
  final String source;
  final String unitType;
  final TextEditingController quantityController;

  const BundlingConversionHint({
    super.key,
    required this.product,
    required this.source,
    required this.unitType,
    required this.quantityController,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final label = _unitLabel(unitType);
    final ipp = _itemsPerPacket(product);
    final pk = _packetsPerOutputUnit(product, unitType);
    final loose = _itemsPerOutputUnit(product, unitType);
    final n = int.tryParse(quantityController.text.trim());

    final lines = <Widget>[
      Row(
        children: [
          Icon(Icons.calculate_outlined, size: 20, color: cs.primary),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Conversion (product settings)',
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ],
      ),
      const SizedBox(height: 10),
    ];

    if (source == 'packed') {
      lines.add(Text(
        '1 $label = $pk packed packets',
        style: theme.textTheme.bodyMedium?.copyWith(
          fontWeight: FontWeight.w600,
        ),
      ));
      if (ipp > 0) {
        lines.add(
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              '≈ ${pk * ipp} loose items ($pk pkts × $ipp items/packet)',
              style: theme.textTheme.bodySmall?.copyWith(
                color: cs.onSurfaceVariant,
              ),
            ),
          ),
        );
      }
      if (n != null && n > 0) {
        lines.add(
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              'This entry: $n $label(s) → ${n * pk} packets deducted',
              style: theme.textTheme.bodySmall?.copyWith(
                color: cs.primary,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        );
      }
    } else {
      lines.add(Text(
        '1 $label = $loose loose items',
        style: theme.textTheme.bodyMedium?.copyWith(
          fontWeight: FontWeight.w600,
        ),
      ));
      if (ipp > 0 && loose > 0) {
        final approxPk = (loose / ipp).round();
        lines.add(
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              '≈ $approxPk packets worth ($loose loose ÷ $ipp items/packet)',
              style: theme.textTheme.bodySmall?.copyWith(
                color: cs.onSurfaceVariant,
              ),
            ),
          ),
        );
      }
      if (n != null && n > 0) {
        lines.add(
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              'This entry: $n $label(s) → ${n * loose} loose items deducted',
              style: theme.textTheme.bodySmall?.copyWith(
                color: cs.primary,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        );
      }
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: cs.tertiaryContainer.withValues(alpha: 0.4),
        border: Border.all(
          color: cs.outlineVariant.withValues(alpha: 0.35),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: lines,
      ),
    );
  }
}
