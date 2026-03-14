import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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
            source: _source,
            capId: _source == 'semi_finished' ? _selectedCapVariantId : null,
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
                content: const Text('Bundling recorded successfully!'),
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
    final isSubmitting = ref.watch(inventoryOperationProvider).isLoading;
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Scaffold(
      appBar: AppBar(title: const Text('Bundling Entry')),
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
                    labelText: 'Product Type',
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
                      value == null ? 'Please select a product type' : null,
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

              // Conditional Cap Selector
              if (_source == 'semi_finished') ...[
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
                'Bundling Source',
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

              // Quantity Input
              TextFormField(
                controller: _quantityController,
                decoration: const InputDecoration(
                  labelText: 'Bundles Created',
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
                  isSubmitting ? 'Submitting...' : 'Confirm Bundling',
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
