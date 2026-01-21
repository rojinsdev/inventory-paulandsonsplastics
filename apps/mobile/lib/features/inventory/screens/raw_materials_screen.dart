import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/inventory_provider.dart';
import '../providers/raw_material_model.dart';

class RawMaterialsScreen extends ConsumerWidget {
  const RawMaterialsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rawMaterialsAsync = ref.watch(rawMaterialsProvider);
    final theme = Theme.of(context);

    // Listen for operation state changes (success/error handling)
    ref.listen<AsyncValue<void>>(inventoryOperationProvider, (previous, next) {
      next.when(
        data: (_) {
          if (previous?.isLoading == true) {
            Navigator.of(context).pop(); // Close modal
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Stock adjusted successfully')),
            );
            ref.invalidate(rawMaterialsProvider); // Refresh list
          }
        },
        error: (e, _) {
          if (previous?.isLoading == true) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('Error: ${e.toString()}'),
                backgroundColor: theme.colorScheme.error,
              ),
            );
          }
        },
        loading: () {},
      );
    });

    return Scaffold(
      appBar: AppBar(
        title: const Text('Raw Materials'),
        elevation: 0,
      ),
      body: rawMaterialsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 48, color: Colors.red),
              const SizedBox(height: 16),
              Text('Error: $e'),
              TextButton(
                onPressed: () => ref.invalidate(rawMaterialsProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (materials) {
          if (materials.isEmpty) {
            return const Center(child: Text('No raw materials found'));
          }
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: materials.length,
            separatorBuilder: (_, __) => const SizedBox(height: 12),
            itemBuilder: (context, index) {
              final material = materials[index];
              return Card(
                elevation: 0,
                color: theme.colorScheme.surfaceContainer,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16)),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  material.name,
                                  style: theme.textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  'Current: ${material.stockWeightKg} kg',
                                  style: theme.textTheme.bodyMedium?.copyWith(
                                    color: theme.colorScheme.onSurfaceVariant,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          ElevatedButton.icon(
                            onPressed: () =>
                                _showAdjustModal(context, material, ref),
                            icon: const Icon(Icons.edit, size: 16),
                            label: const Text('Adjust'),
                            style: ElevatedButton.styleFrom(
                              backgroundColor:
                                  theme.colorScheme.primaryContainer,
                              foregroundColor:
                                  theme.colorScheme.onPrimaryContainer,
                              elevation: 0,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }

  void _showAdjustModal(
      BuildContext context, RawMaterial material, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (context) => _AdjustStockModal(material: material),
    );
  }
}

class _AdjustStockModal extends ConsumerStatefulWidget {
  final RawMaterial material;

  const _AdjustStockModal({required this.material});

  @override
  ConsumerState<_AdjustStockModal> createState() => _AdjustStockModalState();
}

class _AdjustStockModalState extends ConsumerState<_AdjustStockModal> {
  final _quantityController = TextEditingController();
  final _reasonController = TextEditingController();
  bool _isAdding = true; // true = Add, false = Remove

  @override
  void dispose() {
    _quantityController.dispose();
    _reasonController.dispose();
    super.dispose();
  }

  void _submit() {
    final qty = double.tryParse(_quantityController.text);
    if (qty == null || qty <= 0) return;

    final finalQty = _isAdding ? qty : -qty;
    final reason = _reasonController.text.trim();

    ref.read(inventoryOperationProvider.notifier).adjustRawMaterial(
          widget.material.id,
          finalQty,
          reason.isEmpty
              ? (_isAdding ? 'Manual Adjustment (Add)' : 'Consumption')
              : reason,
        );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isLoading = ref.watch(inventoryOperationProvider).isLoading;

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        left: 24,
        right: 24,
        top: 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Adjust ${widget.material.name}',
                style: theme.textTheme.titleLarge,
              ),
              IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close)),
            ],
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              Expanded(
                child: ChoiceChip(
                  label: const Text('Add Stock'),
                  selected: _isAdding,
                  onSelected: (val) => setState(() => _isAdding = true),
                  avatar: const Icon(Icons.add),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ChoiceChip(
                  label: const Text('Consume'),
                  selected: !_isAdding,
                  onSelected: (val) => setState(() => _isAdding = false),
                  avatar: const Icon(Icons.remove),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _quantityController,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
              labelText: 'Quantity (kg)',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _reasonController,
            decoration: const InputDecoration(
              labelText: 'Reason (Optional)',
              border: OutlineInputBorder(),
              hintText: 'e.g., Daily Consumption',
            ),
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: isLoading ? null : _submit,
              child: isLoading
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : Text(_isAdding ? 'Add Stock' : 'Record Consumption'),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}
