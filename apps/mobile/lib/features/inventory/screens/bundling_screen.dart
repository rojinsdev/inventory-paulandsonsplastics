import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:collection/collection.dart';
import '../../production/providers/master_data_provider.dart';
import '../../production/utils/cap_templates_for_tub.dart';
import '../../production/utils/inner_variant_for_tub.dart';
import '../providers/inventory_provider.dart';
import '../widgets/conversion_hint_cards.dart';

class BundlingScreen extends ConsumerStatefulWidget {
  const BundlingScreen({super.key});

  @override
  ConsumerState<BundlingScreen> createState() => _BundlingScreenState();
}

class _BundlingScreenState extends ConsumerState<BundlingScreen> {
  final _formKey = GlobalKey<FormState>();
  final _quantityController = TextEditingController();

  String? _selectedProductTemplateId;
  String? _selectedProductVariantId;
  String? _selectedCapTemplateId;
  String? _selectedCapVariantId;
  bool _includeInner = true;
  String? _selectedInnerVariantId;
  String _source = 'packed';
  String _unitType = 'bundle';

  late final VoidCallback _quantityListener;

  @override
  void initState() {
    super.initState();
    _quantityListener = () {
      if (mounted) setState(() {});
    };
    _quantityController.addListener(_quantityListener);
  }

  @override
  void dispose() {
    _quantityController.removeListener(_quantityListener);
    _quantityController.dispose();
    super.dispose();
  }

  InventoryStock? _stockRowForSelectedTub(List<InventoryStock> records) {
    final id = _selectedProductVariantId;
    if (id == null) return null;
    return records.firstWhereOrNull((s) => s.productId == id);
  }

  bool _tubHasMappedInner() {
    final templates = ref.read(productTemplatesProvider).valueOrNull ?? [];
    final tub =
        templates.firstWhereOrNull((t) => t.id == _selectedProductTemplateId);
    final id = tub?.innerTemplateId;
    return id != null && id.isNotEmpty;
  }

  void _applyInnerDefaultForSelection() {
    final templates = ref.read(productTemplatesProvider).valueOrNull ?? [];
    final inners = ref.read(innerTemplatesProvider).valueOrNull ?? [];
    final tub =
        templates.firstWhereOrNull((t) => t.id == _selectedProductTemplateId);
    final itid = tub?.innerTemplateId;
    if (tub == null || itid == null || itid.isEmpty) {
      _selectedInnerVariantId = null;
      return;
    }
    final p =
        tub.variants.firstWhereOrNull((v) => v.id == _selectedProductVariantId);
    _selectedInnerVariantId = resolveInnerVariantIdForTub(
      innerTemplates: inners,
      innerTemplateId: itid,
      tubColor: p?.color ?? '',
    );
  }

  String? _innerIdForSubmit() {
    if (!_tubHasMappedInner() || !_includeInner) return null;
    final templates = ref.read(productTemplatesProvider).valueOrNull ?? [];
    final inners = ref.read(innerTemplatesProvider).valueOrNull ?? [];
    final tub =
        templates.firstWhereOrNull((t) => t.id == _selectedProductTemplateId);
    final itid = tub?.innerTemplateId;
    if (tub == null || itid == null) return null;
    final innerTpl = inners.firstWhereOrNull((t) => t.id == itid);
    if (innerTpl == null || innerTpl.variants.isEmpty) return null;
    final p =
        tub.variants.firstWhereOrNull((v) => v.id == _selectedProductVariantId);
    final auto = resolveInnerVariantIdForTub(
      innerTemplates: inners,
      innerTemplateId: itid,
      tubColor: p?.color ?? '',
    );
    if (innerTpl.variants.length > 1) {
      return _selectedInnerVariantId ?? auto;
    }
    return auto ?? _selectedInnerVariantId;
  }

  void _submit() {
    if (_formKey.currentState!.validate()) {
      ref.read(inventoryOperationProvider.notifier).bundle(
            _selectedProductVariantId!,
            int.parse(_quantityController.text),
            unitType: _unitType,
            source: _source,
            capId: _selectedCapVariantId,
            innerId: _innerIdForSubmit(),
            includeInner: _tubHasMappedInner() ? _includeInner : true,
          );
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(innerTemplatesProvider, (previous, next) {
      next.whenData((_) {
        if (!mounted) return;
        if (_selectedProductVariantId != null && _includeInner) {
          setState(_applyInnerDefaultForSelection);
        }
      });
    });

    ref.listen(inventoryOperationProvider, (previous, next) {
      next.when(
        data: (_) {
          if (previous?.isLoading ?? false) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: const Text('Bundle packaging recorded successfully!'),
                behavior: SnackBarBehavior.floating,
                margin: const EdgeInsets.all(20),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
            );
            context.pop();
          }
        },
        error: (err, stack) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                'Error: ${err.toString().replaceAll('Exception: ', '')}',
              ),
              backgroundColor: Theme.of(context).colorScheme.error,
              behavior: SnackBarBehavior.floating,
            ),
          );
        },
        loading: () {},
      );
    });

    final productTemplatesAsync = ref.watch(productTemplatesProvider);
    final capTemplatesAsync = ref.watch(capTemplatesProvider);
    final stockAsync = ref.watch(inventoryStockProvider);
    final isSubmitting = ref.watch(inventoryOperationProvider).isLoading;
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Scaffold(
      appBar: AppBar(title: const Text('Bundle Packaging Entry')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24.0),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Header info
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: colorScheme.tertiaryContainer,
                  borderRadius: BorderRadius.circular(32),
                ),
                child: Row(
                  children: [
                    Icon(
                      _source == 'packed'
                          ? Icons.layers_outlined
                          : Icons.inventory_2_outlined,
                      color: colorScheme.onTertiaryContainer,
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Text(
                        _source == 'packed'
                            ? 'Record finished bundles from packed packets.'
                            : 'Record finished bundles directly from loose items.',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: colorScheme.onTertiaryContainer,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 32),

              // Product Template Selector
              productTemplatesAsync.when(
                data: (templates) => DropdownButtonFormField<String>(
                  value: _selectedProductTemplateId,
                  decoration: const InputDecoration(
                    labelText: 'Tub Type',
                    prefixIcon: Icon(Icons.inventory_2_outlined),
                  ),
                  items: templates
                      .map(
                        (t) => DropdownMenuItem(
                          value: t.id,
                          child: Text(t.name),
                        ),
                      )
                      .toList(),
                  onChanged: (value) {
                    setState(() {
                      _selectedProductTemplateId = value;
                      _selectedProductVariantId = null;
                      final t = templates.firstWhereOrNull((x) => x.id == value);
                      final allCaps =
                          ref.read(capTemplatesProvider).valueOrNull ?? [];
                      final allowed = capTemplatesForSelectedTub(
                        tubTemplate: t,
                        allCapTemplates: allCaps,
                      );
                      if (allowed.length == 1) {
                        _selectedCapTemplateId = allowed.single.id;
                      } else {
                        _selectedCapTemplateId = null;
                      }
                      _selectedCapVariantId = null;
                      _selectedInnerVariantId = null;
                      _includeInner = true;
                    });
                  },
                  validator: (value) =>
                      value == null ? 'Please select a tub type' : null,
                ),
                loading: () => const LinearProgressIndicator(),
                error: (error, _) => Text('Error: $error'),
              ),
              const SizedBox(height: 24),

              // Final Form Selector (Bundle/Bag/Box)
              productTemplatesAsync.when(
                data: (templates) {
                  final template = _selectedProductTemplateId != null
                      ? templates.firstWhereOrNull(
                          (t) => t.id == _selectedProductTemplateId)
                      : null;

                  final segments = <ButtonSegment<String>>[];

                  // Always show bundle if enabled or if nothing selected (to avoid empty list)
                  if (template == null || template.bundleEnabled) {
                    segments.add(const ButtonSegment(
                      value: 'bundle',
                      label: Text('Bundle'),
                      icon: Icon(Icons.inventory_2),
                    ));
                  }

                  if (template != null && template.bagEnabled) {
                    segments.add(const ButtonSegment(
                      value: 'bag',
                      label: Text('Bag'),
                      icon: Icon(Icons.shopping_bag_outlined),
                    ));
                  }

                  if (template != null && template.boxEnabled) {
                    segments.add(const ButtonSegment(
                      value: 'box',
                      label: Text('Box'),
                      icon: Icon(Icons.all_inbox_outlined),
                    ));
                  }

                  // If current unitType is not in segments, reset to first available
                  if (segments.isNotEmpty &&
                      !segments.any((s) => s.value == _unitType)) {
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      if (mounted) {
                        setState(() => _unitType = segments.first.value);
                      }
                    });
                  }

                  if (segments.isEmpty) {
                    return const SizedBox.shrink();
                  }

                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Final Tub Form',
                        style: theme.textTheme.titleSmall?.copyWith(
                          color: colorScheme.primary,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 8),
                      SegmentedButton<String>(
                        segments: segments,
                        selected: {_unitType},
                        onSelectionChanged: (Set<String> newSelection) {
                          setState(() => _unitType = newSelection.first);
                        },
                        style: SegmentedButton.styleFrom(
                          selectedBackgroundColor: colorScheme.primaryContainer,
                          selectedForegroundColor:
                              colorScheme.onPrimaryContainer,
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(32)),
                        ),
                      ),
                    ],
                  );
                },
                loading: () => const SizedBox.shrink(),
                error: (error, _) => const SizedBox.shrink(),
              ),
              const SizedBox(height: 24),

              // Product Variant (Color) Selector
              if (_selectedProductTemplateId != null) ...[
                productTemplatesAsync.when(
                  data: (templates) {
                    final template = templates
                        .firstWhere((t) => t.id == _selectedProductTemplateId);
                    return DropdownButtonFormField<String>(
                      key: ValueKey('tub_variant_$_selectedProductTemplateId'),
                      value: _selectedProductVariantId,
                      decoration: const InputDecoration(
                        labelText: 'Color / Variant',
                        prefixIcon: Icon(Icons.palette_outlined),
                      ),
                      items: template.variants
                          .map(
                            (v) => DropdownMenuItem(
                              value: v.id,
                              child:
                                  Text(v.color.isEmpty ? 'Standard' : v.color),
                            ),
                          )
                          .toList(),
                      onChanged: (value) {
                        setState(() {
                          _selectedProductVariantId = value;
                          _applyInnerDefaultForSelection();
                        });
                      },
                      validator: (value) =>
                          value == null ? 'Please select a color' : null,
                    );
                  },
                  loading: () => const SizedBox.shrink(),
                  error: (error, _) => const SizedBox.shrink(),
                ),
                const SizedBox(height: 24),
              ],

              // Cap Selector Section (scoped to tub’s web cap mapping when set)
              ...[
                capTemplatesAsync.when(
                  data: (allCapTemplates) => productTemplatesAsync.when(
                    data: (productTemplates) {
                      final tub = _selectedProductTemplateId != null
                          ? productTemplates.firstWhereOrNull(
                              (t) => t.id == _selectedProductTemplateId)
                          : null;
                      final capChoices = capTemplatesForSelectedTub(
                        tubTemplate: tub,
                        allCapTemplates: allCapTemplates,
                      );
                      final mappedMissing = tub != null &&
                          (tub.capTemplateId?.isNotEmpty ?? false) &&
                          capChoices.isEmpty;

                      if (mappedMissing) {
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Text(
                            'This tub is linked to a cap template that is not in this factory’s cap list. Check the web app.',
                            style: theme.textTheme.bodyMedium
                                ?.copyWith(color: colorScheme.error),
                          ),
                        );
                      }

                      return DropdownButtonFormField<String>(
                        value: _selectedCapTemplateId != null &&
                                capChoices.any(
                                    (c) => c.id == _selectedCapTemplateId)
                            ? _selectedCapTemplateId
                            : null,
                        decoration: InputDecoration(
                          labelText: 'Cap Type',
                          prefixIcon: const Icon(Icons.adjust),
                          helperText:
                              (tub?.capTemplateId?.isNotEmpty ?? false)
                                  ? 'Only the cap mapped to this tub on the web is listed'
                                  : null,
                        ),
                        items: capChoices
                            .map(
                              (t) => DropdownMenuItem(
                                value: t.id,
                                child: Text(t.name),
                              ),
                            )
                            .toList(),
                        onChanged: (value) {
                          setState(() {
                            _selectedCapTemplateId = value;
                            _selectedCapVariantId = null;
                          });
                        },
                        validator: (value) => value == null
                            ? 'Please select a cap type'
                            : null,
                      );
                    },
                    loading: () => const LinearProgressIndicator(),
                    error: (error, _) => Text('Error: $error'),
                  ),
                  loading: () => const LinearProgressIndicator(),
                  error: (error, _) => Text('Error: $error'),
                ),
                const SizedBox(height: 24),

                // Cap Variant (Color) Selector
                if (_selectedCapTemplateId != null) ...[
                  capTemplatesAsync.when(
                    data: (templates) {
                      final template = templates
                          .firstWhere((t) => t.id == _selectedCapTemplateId);
                      return DropdownButtonFormField<String>(
                        key: ValueKey('cap_color_$_selectedCapTemplateId'),
                        value: _selectedCapVariantId,
                        decoration: const InputDecoration(
                          labelText: 'Cap Color',
                          prefixIcon: Icon(Icons.colorize_outlined),
                        ),
                        items: template.variants
                            .map(
                              (v) => DropdownMenuItem(
                                value: v.id,
                                child: _source == 'packed'
                                    ? Text(v.color ?? 'Standard')
                                    : Row(
                                        mainAxisAlignment:
                                            MainAxisAlignment.spaceBetween,
                                        children: [
                                          Text(v.color ?? 'Standard'),
                                          Text(
                                            '${v.stockQuantity} loose caps',
                                            style: theme.textTheme.bodySmall
                                                ?.copyWith(
                                              color: v.stockQuantity < 100
                                                  ? Colors.red
                                                  : Colors.green,
                                              fontWeight: FontWeight.bold,
                                            ),
                                          ),
                                        ],
                                      ),
                              ),
                            )
                            .toList(),
                        onChanged: (value) =>
                            setState(() => _selectedCapVariantId = value),
                        validator: (value) =>
                            value == null ? 'Please select a cap color' : null,
                      );
                    },
                    loading: () => const SizedBox.shrink(),
                    error: (error, _) => const SizedBox.shrink(),
                  ),
                  const SizedBox(height: 24),
                ],
              ],

              if (_selectedProductVariantId != null)
                ref.watch(innerTemplatesProvider).when(
                      data: (innerTpls) {
                        return productTemplatesAsync.when(
                          data: (templates) {
                            final tub = templates.firstWhereOrNull(
                                (t) => t.id == _selectedProductTemplateId);
                            final innerTplId = tub?.innerTemplateId;
                            if (innerTplId == null || innerTplId.isEmpty) {
                              return const SizedBox.shrink();
                            }
                            final innerTpl = innerTpls
                                .firstWhereOrNull((t) => t.id == innerTplId);
                            if (innerTpl == null ||
                                innerTpl.variants.isEmpty) {
                              return Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: Text(
                                  'Inner is mapped on this tub but inner data is missing.',
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: colorScheme.error,
                                  ),
                                ),
                              );
                            }
                            final tubColor = tub!.variants
                                    .firstWhereOrNull((v) =>
                                        v.id == _selectedProductVariantId)
                                    ?.color ??
                                '';
                            final resolved = _selectedInnerVariantId ??
                                resolveInnerVariantIdForTub(
                                  innerTemplates: innerTpls,
                                  innerTemplateId: innerTplId,
                                  tubColor: tubColor,
                                );
                            final dropdownValue = innerTpl.variants
                                    .any((v) => v.id == resolved)
                                ? resolved!
                                : innerTpl.variants.first.id;
                            return Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                SwitchListTile(
                                  contentPadding: EdgeInsets.zero,
                                  title: const Text('Include inner (liner)'),
                                  subtitle: const Text(
                                    'Off = bundle without tying stock to a specific inner.',
                                  ),
                                  value: _includeInner,
                                  onChanged: (v) {
                                    setState(() {
                                      _includeInner = v;
                                      if (v) {
                                        _applyInnerDefaultForSelection();
                                      } else {
                                        _selectedInnerVariantId = null;
                                      }
                                    });
                                  },
                                ),
                                if (_includeInner &&
                                    innerTpl.variants.length > 1) ...[
                                  const SizedBox(height: 8),
                                  DropdownButtonFormField<String>(
                                    value: dropdownValue,
                                    decoration: const InputDecoration(
                                      labelText: 'Inner variant',
                                      prefixIcon:
                                          Icon(Icons.layers_outlined),
                                    ),
                                    items: innerTpl.variants
                                        .map(
                                          (v) => DropdownMenuItem(
                                            value: v.id,
                                            child: Text(
                                              (v.color ?? '').isNotEmpty
                                                  ? v.color!
                                                  : 'Standard',
                                            ),
                                          ),
                                        )
                                        .toList(),
                                    onChanged: (id) => setState(
                                        () => _selectedInnerVariantId = id),
                                  ),
                                ],
                                const SizedBox(height: 16),
                              ],
                            );
                          },
                          loading: () => const SizedBox.shrink(),
                          error: (_, __) => const SizedBox.shrink(),
                        );
                      },
                      loading: () => const SizedBox.shrink(),
                      error: (_, __) => const SizedBox.shrink(),
                    ),

              // Source Selector
              Text(
                'Tub Packaging Source',
                style: theme.textTheme.titleSmall?.copyWith(
                  color: colorScheme.primary,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(
                    value: 'packed',
                    label: Text('From Packets'),
                    icon: Icon(Icons.layers_outlined),
                  ),
                  ButtonSegment(
                    value: 'semi_finished',
                    label: Text('From Loose'),
                    icon: Icon(Icons.inventory_2_outlined),
                  ),
                ],
                selected: {_source},
                onSelectionChanged: (Set<String> newSelection) {
                  setState(() => _source = newSelection.first);
                },
                style: SegmentedButton.styleFrom(
                  selectedBackgroundColor: colorScheme.tertiaryContainer,
                  selectedForegroundColor: colorScheme.onTertiaryContainer,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(32)),
                ),
              ),
              const SizedBox(height: 16),
              if (_selectedProductVariantId != null)
                productTemplatesAsync.when(
                  data: (templates) {
                    final p = resolveSelectedProduct(
                      templates,
                      _selectedProductTemplateId,
                      _selectedProductVariantId,
                    );
                    if (p == null) return const SizedBox.shrink();
                    return BundlingConversionHint(
                      product: p,
                      source: _source,
                      unitType: _unitType,
                      quantityController: _quantityController,
                    );
                  },
                  loading: () => const SizedBox.shrink(),
                  error: (_, __) => const SizedBox.shrink(),
                ),
              const SizedBox(height: 24),

              // Packed → bundle: show packet counts per cap (not loose cap inventory)
              if (_selectedProductVariantId != null && _source == 'packed')
                stockAsync.when(
                  data: (stockRecords) {
                    final item = _stockRowForSelectedTub(stockRecords);
                    if (item == null) {
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 24),
                        child: Text(
                          'No stock data for this tub. Try refreshing after inventory sync.',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: colorScheme.error,
                          ),
                        ),
                      );
                    }

                    final packetRows =
                        InventoryStockComboHelper.packetCombos(item);
                    final totalPackets = packetRows.fold<int>(
                        0, (sum, c) => sum + c.packedQty);
                    final selectedCombo = _selectedCapVariantId != null
                        ? InventoryStockComboHelper.packetComboForSelectedCap(
                            item, _selectedCapVariantId)
                        : null;
                    final selectedPackets = selectedCombo?.packedQty ?? 0;
                    final hasMismatch =
                        selectedPackets == 0 && totalPackets > 0;

                    return Container(
                      margin: const EdgeInsets.only(bottom: 24),
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: hasMismatch
                            ? Colors.orange.withOpacity(0.12)
                            : (selectedPackets > 0
                                ? Colors.blue.withOpacity(0.1)
                                : Colors.red.withOpacity(0.1)),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: hasMismatch
                              ? Colors.orange.withOpacity(0.4)
                              : (selectedPackets > 0
                                  ? Colors.blue.withOpacity(0.3)
                                  : Colors.red.withOpacity(0.3)),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Packed packets (this tub)',
                            style: theme.textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          Text(
                            item.displayName,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: colorScheme.onSurfaceVariant,
                            ),
                          ),
                          const SizedBox(height: 12),
                          if (_selectedCapVariantId != null) ...[
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text('Selected cap · packets'),
                                Text(
                                  '$selectedPackets',
                                  style: theme.textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                          ],
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                'All caps · packets (total)',
                                style: theme.textTheme.bodySmall,
                              ),
                              Text(
                                '$totalPackets',
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                          if (packetRows.isNotEmpty) ...[
                            const Divider(height: 20),
                            Text(
                              'Breakdown',
                              style: theme.textTheme.labelMedium?.copyWith(
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 8),
                            ...packetRows.map((c) {
                              final sel = _selectedCapVariantId != null &&
                                  c.capId == _selectedCapVariantId;
                              return Padding(
                                padding: const EdgeInsets.symmetric(vertical: 4),
                                child: Row(
                                  children: [
                                    Icon(
                                      sel
                                          ? Icons.check_circle_outline
                                          : Icons.circle_outlined,
                                      size: 18,
                                      color: sel
                                          ? colorScheme.primary
                                          : colorScheme.outline,
                                    ),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: Text(
                                          InventoryStockComboHelper.comboLabel(
                                              c)),
                                    ),
                                    Text(
                                      '${c.packedQty} pkt',
                                      style: theme.textTheme.bodyMedium
                                          ?.copyWith(
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ],
                                ),
                              );
                            }),
                          ],
                          if (hasMismatch) ...[
                            const SizedBox(height: 12),
                            Text(
                              'No packets for the cap you selected, but other caps have stock — use the breakdown or change cap color.',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: Colors.orange.shade900,
                              ),
                            ),
                          ],
                          if (packetRows.isEmpty && totalPackets == 0)
                            Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Text(
                                'No packed packets in stock for this tub.',
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: colorScheme.error,
                                ),
                              ),
                            ),
                        ],
                      ),
                    );
                  },
                  loading: () => const Padding(
                    padding: EdgeInsets.only(bottom: 24),
                    child: LinearProgressIndicator(),
                  ),
                  error: (_, __) => const SizedBox.shrink(),
                ),

              if (_selectedProductVariantId != null &&
                  _source == 'semi_finished')
                stockAsync.when(
                  data: (stockRecords) {
                    final item = _stockRowForSelectedTub(stockRecords);
                    if (item == null) return const SizedBox.shrink();
                    return Container(
                      margin: const EdgeInsets.only(bottom: 24),
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: colorScheme.surfaceContainerHighest,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: colorScheme.outlineVariant,
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Loose items (this tub)',
                            style: theme.textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          Text(
                            item.displayName,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: colorScheme.onSurfaceVariant,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            '${item.semiFinishedQty} items available',
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                  loading: () => const SizedBox.shrink(),
                  error: (_, __) => const SizedBox.shrink(),
                ),

              TextFormField(
                controller: _quantityController,
                decoration: InputDecoration(
                  labelText: '${_unitType[0].toUpperCase()}${_unitType.substring(1)}s Created',
                  prefixIcon: const Icon(Icons.numbers),
                  suffixText: 'units',
                ),
                keyboardType: TextInputType.number,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Please enter quantity';
                  }
                  final n = int.tryParse(value);
                  if (n == null || n <= 0) return 'Must be greater than 0';
 
                  // Stock Validation
                  final stockRecords = stockAsync.value;
                  if (stockRecords != null && _selectedProductVariantId != null) {
                    final item = stockRecords.firstWhereOrNull(
                      (s) => s.productId == _selectedProductVariantId,
                    );
 
                    if (item != null) {
                      if (_source == 'packed') {
                        final combination =
                            InventoryStockComboHelper.packetComboForSelectedCap(
                                item, _selectedCapVariantId);
                        final specificPackedQty = combination?.packedQty ?? 0;

                        final packetsPerUnit = _unitType == 'box'
                            ? item.packetsPerBox
                            : (_unitType == 'bag'
                                ? item.packetsPerBag
                                : item.packetsPerBundle);
                        
                        final requiredPackets = n * (packetsPerUnit ?? 50);
                        if (specificPackedQty < requiredPackets) {
                          return 'Insufficient packets for this cap. Have: $specificPackedQty, Need: $requiredPackets';
                        }
                      } else {
                        final itemsPerUnit = _unitType == 'box'
                            ? item.itemsPerBox
                            : (_unitType == 'bag'
                                ? item.itemsPerBag
                                : item.itemsPerBundle);
                        
                        final requiredItems = n * (itemsPerUnit ?? 600);
                        if (item.semiFinishedQty < requiredItems) {
                          return 'Insufficient loose stock. Have: ${item.semiFinishedQty}, Need: $requiredItems';
                        }
                      }
                    }
                  }
                  return null;
                },
              ),
              const SizedBox(height: 48),

              // Submit Button
              FilledButton.icon(
                onPressed: isSubmitting ? null : _submit,
                icon: isSubmitting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          color: Colors.white,
                          strokeWidth: 2,
                        ),
                      )
                    : const Icon(Icons.check),
                label: Text(
                  isSubmitting ? 'Submitting...' : 'Confirm Bundle Packaging',
                ),
                style: FilledButton.styleFrom(
                  backgroundColor: colorScheme.tertiary,
                  foregroundColor: colorScheme.onTertiary,
                  minimumSize: const Size(double.infinity, 64),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
