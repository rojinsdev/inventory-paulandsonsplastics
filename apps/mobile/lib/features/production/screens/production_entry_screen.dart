import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../production/providers/master_data_provider.dart';
import '../../production/providers/production_provider.dart';

class ProductionEntryScreen extends ConsumerStatefulWidget {
  const ProductionEntryScreen({super.key});

  @override
  ConsumerState<ProductionEntryScreen> createState() =>
      _ProductionEntryScreenState();
}

class _ProductionEntryScreenState extends ConsumerState<ProductionEntryScreen> {
  final _formKey = GlobalKey<FormState>();
  final _quantityController = TextEditingController();

  String? _selectedMachineId;
  String? _selectedProductId;
  String _selectedShift = 'morning';
  DateTime _selectedDate = DateTime.now();

  @override
  void dispose() {
    _quantityController.dispose();
    super.dispose();
  }

  Future<void> _selectDate(BuildContext context) async {
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(2025),
      lastDate: DateTime.now(),
    );
    if (picked != null && picked != _selectedDate) {
      setState(() {
        _selectedDate = picked;
      });
    }
  }

  void _submit() {
    if (_formKey.currentState!.validate()) {
      if (_selectedMachineId == null || _selectedProductId == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Please select machine and product')),
        );
        return;
      }

      ref.read(productionSubmissionProvider.notifier).submit(
            machineId: _selectedMachineId!,
            productId: _selectedProductId!,
            quantity: int.parse(_quantityController.text),
            date: _selectedDate,
            shift: _selectedShift,
          );
    }
  }

  @override
  Widget build(BuildContext context) {
    // Listeners for success/error...
    ref.listen(productionSubmissionProvider, (previous, next) {
      next.when(
        data: (_) {
          if (previous?.isLoading ?? false) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: const Text('Production submitted successfully!'),
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

    final machinesAsync = ref.watch(machinesProvider);
    final productsAsync = ref.watch(productsProvider);
    final isSubmitting = ref.watch(productionSubmissionProvider).isLoading;
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(title: const Text('New Production')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24.0),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Date Selection
              GestureDetector(
                onTap: () => _selectDate(context),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 24,
                  ),
                  decoration: BoxDecoration(
                    color: colorScheme.surface.withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: colorScheme.outlineVariant),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Production Date',
                            style: TextStyle(
                              color: colorScheme.onSurfaceVariant,
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            DateFormat('EEEE, MMM d').format(_selectedDate),
                            style: TextStyle(
                              color: colorScheme.onSurface,
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                      Icon(Icons.calendar_today, color: colorScheme.primary),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // Shift Segments (Custom Expressive Selector)
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(
                    value: 'morning',
                    label: Text('Morning'),
                    icon: Icon(Icons.wb_sunny_outlined),
                  ),
                  ButtonSegment(
                    value: 'evening',
                    label: Text('Evening'),
                    icon: Icon(Icons.wb_twilight),
                  ),
                  ButtonSegment(
                    value: 'night',
                    label: Text('Night'),
                    icon: Icon(Icons.nights_stay_outlined),
                  ),
                ],
                selected: {_selectedShift},
                onSelectionChanged: (Set<String> newSelection) {
                  setState(() {
                    _selectedShift = newSelection.first;
                  });
                },
                style: ButtonStyle(
                  visualDensity: VisualDensity.comfortable,
                  shape: WidgetStateProperty.all(
                    RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(24),
                    ),
                  ),
                  padding: WidgetStateProperty.all(
                    const EdgeInsets.symmetric(vertical: 20),
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // Machine Dropdown
              machinesAsync.when(
                data: (machines) => DropdownButtonFormField<String>(
                  initialValue: _selectedMachineId,
                  decoration: const InputDecoration(
                    labelText: 'Machine',
                    prefixIcon: Icon(Icons.precision_manufacturing_outlined),
                  ),
                  items: machines
                      .where((m) => m.status == 'active')
                      .map(
                        (m) =>
                            DropdownMenuItem(value: m.id, child: Text(m.name)),
                      )
                      .toList(),
                  onChanged: (value) =>
                      setState(() => _selectedMachineId = value),
                ),
                loading: () => const LinearProgressIndicator(),
                error: (error, _) => Text(
                  'Error: $error',
                  style: const TextStyle(color: Colors.red),
                ),
              ),
              const SizedBox(height: 24),

              // Product Dropdown
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
                ),
                loading: () => const LinearProgressIndicator(),
                error: (error, _) => Text(
                  'Error: $error',
                  style: const TextStyle(color: Colors.red),
                ),
              ),
              const SizedBox(height: 24),

              // Quantity
              TextFormField(
                controller: _quantityController,
                decoration: const InputDecoration(
                  labelText: 'Quantity',
                  prefixIcon: Icon(Icons.numbers),
                  suffixText: 'units',
                ),
                keyboardType: TextInputType.number,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 48),

              // Submit Action
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
                  isSubmitting ? 'Submitting...' : 'Confirm Production',
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
