import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:collection/collection.dart';
import '../../production/providers/master_data_provider.dart';
import '../providers/inventory_provider.dart';

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
  String _source = 'packed';
  String _unitType = 'bundle';

  @override
  void dispose() {
    _quantityController.dispose();
    super.dispose();
  }

  void _submit() {
    if (_formKey.currentState!.validate()) {
      ref.read(inventoryOperationProvider.notifier).bundle(
            _selectedProductVariantId!,
            int.parse(_quantityController.text),
            unitType: _unitType,
            source: _source,
            capId: _selectedCapVariantId,
          );
    }
  }

  @override
  Widget build(BuildContext context) {
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
                  initialValue: _selectedProductTemplateId,
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
                      initialValue: _selectedProductVariantId,
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
                      onChanged: (value) =>
                          setState(() => _selectedProductVariantId = value),
                      validator: (value) =>
                          value == null ? 'Please select a color' : null,
                    );
                  },
                  loading: () => const SizedBox.shrink(),
                  error: (error, _) => const SizedBox.shrink(),
                ),
                const SizedBox(height: 24),
              ],

              // Cap Selector Section (Explicit variant selection)
              ...[
                // Cap Template Selector
                capTemplatesAsync.when(
                  data: (templates) => DropdownButtonFormField<String>(
                    initialValue: _selectedCapTemplateId,
                    decoration: const InputDecoration(
                      labelText: 'Cap Type',
                      prefixIcon: Icon(Icons.adjust),
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
                        _selectedCapTemplateId = value;
                        _selectedCapVariantId = null;
                      });
                    },
                    validator: (value) =>
                        value == null ? 'Please select a cap type' : null,
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
                        initialValue: _selectedCapVariantId,
                        decoration: const InputDecoration(
                          labelText: 'Cap Color',
                          prefixIcon: Icon(Icons.colorize_outlined),
                        ),
                        items: template.variants
                            .map(
                              (v) => DropdownMenuItem(
                                value: v.id,
                                child: Row(
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceBetween,
                                  children: [
                                    Text(v.color ?? 'Standard'),
                                    Text(
                                      '${v.stockQuantity} qty',
                                      style:
                                          theme.textTheme.bodySmall?.copyWith(
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
              const SizedBox(height: 24),

              // Stock Preview Card (The "Small Preview")
              if (_selectedProductVariantId != null && _source == 'packed')
                stockAsync.when(
                  data: (stockRecords) {
                    final item = stockRecords.firstWhereOrNull(
                      (s) => s.productId == _selectedProductVariantId,
                    );
                    
                    if (item == null) return const SizedBox.shrink();

                    // Find the specific combination for the selected cap
                    final combination = item.combinations.firstWhereOrNull(
                      (c) => c.capId == _selectedCapVariantId,
                    ) ?? item.combinations.firstWhereOrNull((c) => c.capId == null);

                    final availablePackets = combination?.packedQty ?? 0;
                    
                    return Container(
                      margin: const EdgeInsets.only(bottom: 24),
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: availablePackets > 0 
                            ? Colors.blue.withOpacity(0.1) 
                            : Colors.red.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: availablePackets > 0 
                              ? Colors.blue.withOpacity(0.3) 
                              : Colors.red.withOpacity(0.3),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(
                                Icons.inventory_2,
                                size: 16,
                                color: availablePackets > 0 ? Colors.blue : Colors.red,
                              ),
                              const SizedBox(width: 8),
                              Text(
                                'Current Selection Stock',
                                style: theme.textTheme.labelMedium?.copyWith(
                                  fontWeight: FontWeight.bold,
                                  color: availablePackets > 0 ? Colors.blue : Colors.red,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                'Available Packets:',
                                style: theme.textTheme.bodySmall,
                              ),
                              Text(
                                '$availablePackets',
                                style: theme.textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.bold,
                                  color: availablePackets > 0 ? Colors.blue[900] : Colors.red[900],
                                ),
                              ),
                            ],
                          ),
                          if (item.combinations.length > 1) ...[
                            const Divider(height: 16),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  'Total (All Caps):',
                                  style: theme.textTheme.bodySmall?.copyWith(fontStyle: FontStyle.italic),
                                ),
                                Text(
                                  '${item.packedQty}',
                                  style: theme.textTheme.bodySmall?.copyWith(fontStyle: FontStyle.italic),
                                ),
                              ],
                            ),
                          ],
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
                        // RESOLVE SPECIFIC COMBINATION STOCK
                        final combination = item.combinations.firstWhereOrNull(
                          (c) => c.capId == _selectedCapVariantId,
                        ) ?? item.combinations.firstWhereOrNull((c) => c.capId == null);

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
