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

  // Controllers
  final _totalProducedController = TextEditingController();
  final _damagedCountController = TextEditingController();
  final _totalWeightController = TextEditingController();
  final _actualCycleTimeController = TextEditingController();
  final _actualWeightController = TextEditingController();
  final _downtimeReasonController = TextEditingController();

  // State
  String? _selectedMachineId;
  String? _selectedProductId;
  int _shiftNumber = 1; // 1 = Day (8AM-8PM), 2 = Night (8PM-8AM)
  DateTime _selectedDate = DateTime.now();
  TimeOfDay _startTime = const TimeOfDay(hour: 8, minute: 0);
  TimeOfDay _endTime = const TimeOfDay(hour: 20, minute: 0);
  bool _isWeightBased = false; // Determined by product selection

  @override
  void dispose() {
    _totalProducedController.dispose();
    _damagedCountController.dispose();
    _totalWeightController.dispose();
    _actualCycleTimeController.dispose();
    _actualWeightController.dispose();
    _downtimeReasonController.dispose();
    super.dispose();
  }

  Future<void> _fetchLastSession() async {
    if (_selectedMachineId == null) return;

    try {
      final repository = ref.read(productionRepositoryProvider);
      final lastEndTime = await repository.getLastSessionEndTime(
        machineId: _selectedMachineId!,
        date: _selectedDate,
        shiftNumber: _shiftNumber,
      );

      if (lastEndTime != null && mounted) {
        final parts = lastEndTime.split(':');
        setState(() {
          _startTime = TimeOfDay(
            hour: int.parse(parts[0]),
            minute: int.parse(parts[1]),
          );
        });
      }
    } catch (e) {
      // Ignore background fetch errors
    }
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

  Future<void> _selectTime(BuildContext context, bool isStartTime) async {
    final TimeOfDay? picked = await showTimePicker(
      context: context,
      initialTime: isStartTime ? _startTime : _endTime,
    );
    if (picked != null) {
      setState(() {
        if (isStartTime) {
          _startTime = picked;
        } else {
          _endTime = picked;
          _checkShiftBoundary(picked);
        }
      });
    }
  }

  void _checkShiftBoundary(TimeOfDay picked) {
    if (_shiftNumber == 1) {
      // Shift 1 ends at 8PM (20:00)
      if (picked.hour > 20 || (picked.hour == 20 && picked.minute > 0)) {
        _showShiftWarning(2);
      }
    } else {
      // Shift 2 ends at 8AM (08:00)
      if (picked.hour > 8 && picked.hour < 20) {
        _showShiftWarning(1);
      }
    }
  }

  void _showShiftWarning(int nextShift) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Note: This time falls into Shift $nextShift boundary.',
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.orange.shade800,
        duration: const Duration(seconds: 4),
        action: SnackBarAction(
          label: 'OK',
          textColor: Colors.white,
          onPressed: () {},
        ),
      ),
    );
  }

  void _submit({bool saveAndAddAnother = false}) {
    if (_formKey.currentState!.validate()) {
      if (_selectedMachineId == null || _selectedProductId == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Please select machine and product')),
        );
        return;
      }

      // Calculate downtime minutes
      final shiftDuration = _calculateShiftDuration();
      final actualCycleTime = double.parse(_actualCycleTimeController.text);
      final totalProduced =
          _isWeightBased ? null : int.parse(_totalProducedController.text);
      final damagedCount =
          _isWeightBased ? 0 : int.tryParse(_damagedCountController.text) ?? 0;
      final actualQuantity =
          totalProduced != null ? totalProduced - damagedCount : 0;

      final actualProductionTimeSeconds = actualQuantity * actualCycleTime;
      final shiftDurationSeconds = shiftDuration * 3600;
      final downtimeMinutes =
          ((shiftDurationSeconds - actualProductionTimeSeconds) / 60)
              .floor()
              .clamp(0, 1440); // Cap at 0 to avoid Zod errors, max 24h

      ref.read(productionSubmissionProvider.notifier).submit(
            machineId: _selectedMachineId!,
            productId: _selectedProductId!,
            shiftNumber: _shiftNumber,
            startTime:
                '${_startTime.hour.toString().padLeft(2, '0')}:${_startTime.minute.toString().padLeft(2, '0')}',
            endTime:
                '${_endTime.hour.toString().padLeft(2, '0')}:${_endTime.minute.toString().padLeft(2, '0')}',
            totalProduced: _isWeightBased
                ? null
                : int.parse(_totalProducedController.text),
            damagedCount: _isWeightBased
                ? null
                : (int.tryParse(_damagedCountController.text) ?? 0),
            totalWeightKg: _isWeightBased
                ? double.parse(_totalWeightController.text)
                : null,
            actualCycleTimeSeconds:
                double.parse(_actualCycleTimeController.text),
            actualWeightGrams: double.parse(_actualWeightController.text),
            downtimeMinutes: downtimeMinutes,
            downtimeReason:
                downtimeMinutes > 30 ? _downtimeReasonController.text : null,
            date: _selectedDate,
            saveAndAddAnother: saveAndAddAnother,
          );
    }
  }

  double _calculateShiftDuration() {
    int startMinutes = _startTime.hour * 60 + _startTime.minute;
    int endMinutes = _endTime.hour * 60 + _endTime.minute;

    // Handle overnight shifts
    if (_shiftNumber == 2 && endMinutes < startMinutes) {
      endMinutes += 24 * 60;
    }

    return (endMinutes - startMinutes) / 60.0; // Return hours
  }

  void _showHelpGuide() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
        ),
        padding: const EdgeInsets.fromLTRB(28, 20, 28, 40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.outlineVariant,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 24),
            Row(
              children: [
                Icon(Icons.help_outline,
                    color: Theme.of(context).colorScheme.primary, size: 28),
                const SizedBox(width: 12),
                Text('Production Entry Guide',
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.bold,
                        )),
              ],
            ),
            const SizedBox(height: 24),
            _buildGuideItem(
              Icons.production_quantity_limits,
              'Total Produced',
              'The gross number of units the machine produced during this shift (including any damaged ones).',
            ),
            _buildGuideItem(
              Icons.broken_image_outlined,
              'Damaged Count',
              'The number of defective units that cannot be sold. System auto-calculates "Actual Quantity" by subtracting this.',
            ),
            _buildGuideItem(
              Icons.timer_outlined,
              'Actual Cycle Time',
              'Read the "Cycle Time" or "Speed" directly from the machine\'s display monitor.',
            ),
            _buildGuideItem(
              Icons.monitor_weight_outlined,
              'Weight per Unit',
              'Measure one unit on the weighing scale. This helps us track raw material wastage.',
            ),
            _buildGuideItem(
              Icons.report_problem_outlined,
              'Downtime',
              'The system automatically calculates how much time the machine was idle based on your output and speed.',
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildGuideItem(IconData icon, String title, String description) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.primaryContainer,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon,
                size: 20,
                color: Theme.of(context).colorScheme.onPrimaryContainer),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: const TextStyle(
                        fontWeight: FontWeight.bold, fontSize: 16)),
                const SizedBox(height: 4),
                Text(description,
                    style: TextStyle(
                        color: Theme.of(context).colorScheme.onSurfaceVariant)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Listeners for success/error
    ref.listen(productionSubmissionProvider, (previous, next) {
      next.when(
        data: (saveAndAddAnother) {
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

            if (saveAndAddAnother) {
              // Clear form for next entry
              _totalProducedController.clear();
              _damagedCountController.clear();
              _totalWeightController.clear();
              _actualCycleTimeController.clear();
              _actualWeightController.clear();
              _downtimeReasonController.clear();
            } else {
              context.pop();
            }
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
      appBar: AppBar(
        title: const Text('New Production Entry'),
        actions: [
          IconButton(
            onPressed: _showHelpGuide,
            icon: const Icon(Icons.help_outline),
            tooltip: 'Help Guide',
          ),
          const SizedBox(width: 8),
        ],
      ),
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
                  padding:
                      const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
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

              // Shift Selection (1 or 2)
              SegmentedButton<int>(
                segments: const [
                  ButtonSegment(
                    value: 1,
                    label: Text('Shift 1 (Day)'),
                    icon: Icon(Icons.wb_sunny_outlined),
                  ),
                  ButtonSegment(
                    value: 2,
                    label: Text('Shift 2 (Night)'),
                    icon: Icon(Icons.nights_stay_outlined),
                  ),
                ],
                selected: {_shiftNumber},
                onSelectionChanged: (Set<int> newSelection) {
                  setState(() {
                    _shiftNumber = newSelection.first;
                    // Auto-set default times
                    if (_shiftNumber == 1) {
                      _startTime = const TimeOfDay(hour: 8, minute: 0);
                      _endTime = const TimeOfDay(hour: 20, minute: 0);
                    } else {
                      _startTime = const TimeOfDay(hour: 20, minute: 0);
                      _endTime = const TimeOfDay(hour: 8, minute: 0);
                    }
                  });
                  _fetchLastSession();
                },
                style: ButtonStyle(
                  visualDensity: VisualDensity.comfortable,
                  shape: WidgetStateProperty.all(
                    RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(24)),
                  ),
                  padding: WidgetStateProperty.all(
                    const EdgeInsets.symmetric(vertical: 20),
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // Time Pickers Row
              Row(
                children: [
                  Expanded(
                    child: GestureDetector(
                      onTap: () => _selectTime(context, true),
                      child: Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          border: Border.all(color: colorScheme.outline),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Start Time',
                                style: TextStyle(
                                    fontSize: 12,
                                    color: colorScheme.onSurfaceVariant)),
                            const SizedBox(height: 4),
                            Text(_startTime.format(context),
                                style: const TextStyle(
                                    fontSize: 18, fontWeight: FontWeight.bold)),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: GestureDetector(
                      onTap: () => _selectTime(context, false),
                      child: Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          border: Border.all(color: colorScheme.outline),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('End Time',
                                style: TextStyle(
                                    fontSize: 12,
                                    color: colorScheme.onSurfaceVariant)),
                            const SizedBox(height: 4),
                            Text(_endTime.format(context),
                                style: const TextStyle(
                                    fontSize: 18, fontWeight: FontWeight.bold)),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
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
                      .map((m) =>
                          DropdownMenuItem(value: m.id, child: Text(m.name)))
                      .toList(),
                  onChanged: (value) {
                    setState(() => _selectedMachineId = value);
                    _fetchLastSession();
                  },
                  validator: (value) => value == null ? 'Required' : null,
                ),
                loading: () => const LinearProgressIndicator(),
                error: (error, _) => Text('Error: $error',
                    style: const TextStyle(color: Colors.red)),
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
                      .map((p) => DropdownMenuItem(
                            value: p.id,
                            child: Text(p.displayName),
                          ))
                      .toList(),
                  onChanged: (value) {
                    setState(() {
                      _selectedProductId = value;
                      // Check if weight-based (you'll need to add counting_method to Product model)
                      final product = products.firstWhere((p) => p.id == value);
                      _isWeightBased = product.countingMethod == 'weight_based';
                    });
                  },
                  validator: (value) => value == null ? 'Required' : null,
                ),
                loading: () => const LinearProgressIndicator(),
                error: (error, _) => Text('Error: $error',
                    style: const TextStyle(color: Colors.red)),
              ),
              const SizedBox(height: 24),

              // Conditional: Weight-based OR Unit-count
              if (_isWeightBased) ...[
                TextFormField(
                  controller: _totalWeightController,
                  decoration: const InputDecoration(
                    labelText: 'Total Weight (kg)',
                    prefixIcon: Icon(Icons.scale),
                    suffixText: 'kg',
                  ),
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  validator: (value) =>
                      value == null || value.isEmpty ? 'Required' : null,
                ),
              ] else ...[
                TextFormField(
                  controller: _totalProducedController,
                  decoration: const InputDecoration(
                    labelText: 'Total Produced',
                    prefixIcon: Icon(Icons.production_quantity_limits),
                    suffixText: 'units',
                  ),
                  keyboardType: TextInputType.number,
                  validator: (value) =>
                      value == null || value.isEmpty ? 'Required' : null,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _damagedCountController,
                  decoration: const InputDecoration(
                    labelText: 'Damaged Count',
                    prefixIcon: Icon(Icons.broken_image_outlined),
                    suffixText: 'units',
                    hintText: '0',
                  ),
                  keyboardType: TextInputType.number,
                ),
              ],
              const SizedBox(height: 24),

              // Actual Cycle Time
              TextFormField(
                controller: _actualCycleTimeController,
                decoration: const InputDecoration(
                  labelText: 'Actual Cycle Time',
                  prefixIcon: Icon(Icons.timer_outlined),
                  suffixText: 'seconds',
                  helperText: 'From machine display',
                ),
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                validator: (value) =>
                    value == null || value.isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 16),

              // Actual Weight per Unit
              TextFormField(
                controller: _actualWeightController,
                decoration: const InputDecoration(
                  labelText: 'Actual Weight per Unit',
                  prefixIcon: Icon(Icons.monitor_weight_outlined),
                  suffixText: 'grams',
                  helperText: 'Measured weight',
                ),
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                validator: (value) =>
                    value == null || value.isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 24),

              // Downtime Reason (conditional)
              TextFormField(
                controller: _downtimeReasonController,
                decoration: const InputDecoration(
                  labelText: 'Downtime Reason (if > 30 mins)',
                  prefixIcon: Icon(Icons.report_problem_outlined),
                  hintText: 'Die Change, Power Cut, Maintenance, Other',
                ),
                maxLines: 2,
              ),
              const SizedBox(height: 48),

              // Submit Buttons
              FilledButton.icon(
                onPressed: isSubmitting
                    ? null
                    : () => _submit(saveAndAddAnother: false),
                icon: isSubmitting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                            color: Colors.white, strokeWidth: 2),
                      )
                    : const Icon(Icons.check),
                label:
                    Text(isSubmitting ? 'Submitting...' : 'Submit Production'),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: isSubmitting
                    ? null
                    : () => _submit(saveAndAddAnother: true),
                icon: const Icon(Icons.add),
                label: const Text('Save & Add Another (Die Change)'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
