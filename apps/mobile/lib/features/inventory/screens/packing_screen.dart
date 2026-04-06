import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:collection/collection.dart';
import '../../production/providers/master_data_provider.dart';
import '../providers/inventory_provider.dart';

class PackingScreen extends ConsumerStatefulWidget {
  const PackingScreen({super.key});

  @override
  ConsumerState<PackingScreen> createState() => _PackingScreenState();
}

class _PackingScreenState extends ConsumerState<PackingScreen> {
  final _formKey = GlobalKey<FormState>();
  final _quantityController = TextEditingController();

  String? _selectedProductTemplateId;
  String? _selectedProductVariantId;
  String? _selectedCapTemplateId;
  String? _selectedCapVariantId;


  @override
  void dispose() {
    _quantityController.dispose();
    super.dispose();
  }

  void _submit() {
    if (_formKey.currentState!.validate()) {
      ref.read(inventoryOperationProvider.notifier).pack(
            _selectedProductVariantId!,
            int.parse(_quantityController.text),
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
                content: const Text('Packing recorded successfully!'),
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
      appBar: AppBar(title: const Text('Packing Entry')),
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
                  color: colorScheme.secondaryContainer,
                  borderRadius: BorderRadius.circular(24),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.info_outline,
                      color: colorScheme.onSecondaryContainer,
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Text(
                        'Record items packed from semi-finished stock.',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: colorScheme.onSecondaryContainer,
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
                      // Optionally pre-select cap template if mapped in future
                    });
                  },
                  validator: (value) =>
                      value == null ? 'Please select a tub type' : null,
                ),
                loading: () => const LinearProgressIndicator(),
                error: (error, _) => Text('Error: $error'),
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
                                    style: theme.textTheme.bodySmall?.copyWith(
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

              // Quantity Input
              TextFormField(
                controller: _quantityController,
                decoration: const InputDecoration(
                  labelText: 'Packets Created',
                  prefixIcon: Icon(Icons.numbers),
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
                      final itemsPerPacket = item.itemsPerPacket ?? 12;
                      final requiredItems = n * itemsPerPacket;
                      if (item.semiFinishedQty < requiredItems) {
                        return 'Insufficient loose stock. Have: ${item.semiFinishedQty}, Need: $requiredItems';
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
                label: Text(isSubmitting ? 'Submitting...' : 'Confirm Packing'),
                style: FilledButton.styleFrom(
                  backgroundColor: colorScheme.secondary,
                  foregroundColor: colorScheme.onSecondary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
