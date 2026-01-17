import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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
  String? _selectedProductId;

  @override
  void dispose() {
    _quantityController.dispose();
    super.dispose();
  }

  void _submit() {
    if (_formKey.currentState!.validate()) {
      ref
          .read(inventoryOperationProvider.notifier)
          .pack(_selectedProductId!, int.parse(_quantityController.text));
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

    final productsAsync = ref.watch(productsProvider);
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

              // Product Selector
              productsAsync.when(
                data: (products) => DropdownButtonFormField<String>(
                  initialValue: _selectedProductId,
                  decoration: const InputDecoration(
                    labelText: 'Product',
                    prefixIcon: Icon(Icons.inventory_2_outlined),
                  ),
                  items: products
                      .map(
                        (p) => DropdownMenuItem(
                          value: p.id,
                          child: Text(p.displayName),
                        ),
                      )
                      .toList(),
                  onChanged: (value) =>
                      setState(() => _selectedProductId = value),
                  validator: (value) =>
                      value == null ? 'Please select a product' : null,
                ),
                loading: () => const LinearProgressIndicator(),
                error: (error, _) => Text(
                  'Error: $error',
                  style: const TextStyle(color: Colors.red),
                ),
              ),
              const SizedBox(height: 24),

              // Quantity Input
              TextFormField(
                controller: _quantityController,
                decoration: const InputDecoration(
                  labelText: 'Packets Created',
                  prefixIcon: Icon(Icons.numbers),
                  suffixText: 'packets',
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
