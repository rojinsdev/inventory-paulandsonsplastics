import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../production/providers/master_data_provider.dart';
import '../../production/providers/production_provider.dart';
import '../data/models/machine_model.dart';
import '../data/models/product_template_model.dart';

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
  String? _selectedTemplateId;
  String? _selectedProductId; // Represents the specific variant (Color)
  int _shiftNumber = 1; // 1 = Day (8AM-8PM), 2 = Night (8PM-8AM)
  DateTime _selectedDate = DateTime.now();
  TimeOfDay _startTime = const TimeOfDay(hour: 8, minute: 0);
  TimeOfDay _endTime = const TimeOfDay(hour: 20, minute: 0);
  bool _isWeightBased = false; // Determined by product selection

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    final hour = now.hour;

    // Shift 1: 08:00 to 19:59 (8 AM to 7:59 PM)
    // Shift 2: 20:00 to 07:59 (8 PM to 7:59 AM)
    if (hour >= 8 && hour < 20) {
      _shiftNumber = 1;
      _startTime = const TimeOfDay(hour: 8, minute: 0);
      _endTime = const TimeOfDay(hour: 20, minute: 0);
    } else {
      _shiftNumber = 2;
      _startTime = const TimeOfDay(hour: 20, minute: 0);
      _endTime = const TimeOfDay(hour: 8, minute: 0);
    }
  }

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

      if (lastEndTime != null && mounted && lastEndTime.contains(':')) {
        final parts = lastEndTime.split(':');
        try {
          final hour = int.tryParse(parts[0]);
          final minute = int.tryParse(parts[1]);
          
          if (hour != null && minute != null) {
            setState(() {
              final newStart = TimeOfDay(hour: hour, minute: minute);
              
              // 1. Boundary check: If last session ended at or after shift boundary,
              // don't apply sticky start; keep default shift start.
              bool isAtShiftEnd = false;
              if (_shiftNumber == 1) {
                // Shift 1 boundary: 8:00 PM (20:00)
                if (hour >= 20) isAtShiftEnd = true;
              } else {
                // Shift 2 boundary: 8:00 AM (08:00)
                if (hour >= 8 && hour < 20) isAtShiftEnd = true;
              }

              if (isAtShiftEnd) {
                // Keep default shift times if the shift is effectively over
                return;
              }

              _startTime = newStart;

              // 2. Adjust end time to shift boundary (don't force short sessions)
              if (_shiftNumber == 1) {
                _endTime = const TimeOfDay(hour: 20, minute: 0);
              } else {
                _endTime = const TimeOfDay(hour: 8, minute: 0);
              }

              // Final safety: ensuring duration > 0
              final startMins = _startTime.hour * 60 + _startTime.minute;
              var endMins = _endTime.hour * 60 + _endTime.minute;
              if (_shiftNumber == 2 && endMins < 480) endMins += 24 * 60;
              final effStartMins = (_shiftNumber == 2 && startMins < 480) ? startMins + 24 * 60 : startMins;

              if (effStartMins >= endMins) {
                // If we're already at/past boundary, this shouldn't happen due to isAtShiftEnd,
                // but if it does, fallback to 15 min or default.
                _endTime = TimeOfDay(hour: (_startTime.hour + 1) % 24, minute: _startTime.minute);
              }
            });
          }
        } catch (e) {
          debugPrint('Error parsing last session time: $e');
        }
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
      _fetchLastSession();
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
          const SnackBar(content: Text('Please select machine and tub')),
        );
        return;
      }

      // Calculate downtime minutes
      final shiftDuration = _calculateShiftDuration();

      if (shiftDuration <= 0) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content:
                Text('Invalid shift times: End time must be after start time'),
            backgroundColor: Colors.red,
          ),
        );
        return;
      }

      final actualCycleTime = double.tryParse(_actualCycleTimeController.text) ?? 0.0;
      
      // Get cavity count for this machine-template mapping
      final machines = ref.read(machinesProvider).value ?? [];
      final Machine? machine = machines.any((m) => m.id == _selectedMachineId) 
          ? machines.firstWhere((m) => m.id == _selectedMachineId)
          : null;
      final int cavityCount = (machine != null && _selectedTemplateId != null)
          ? (machine.templateCavityCounts[_selectedTemplateId] ?? 1)
          : 1;

      int actualQuantity = 0;
      if (_isWeightBased) {
        final totalWeight = double.tryParse(_totalWeightController.text) ?? 0.0;
        final unitWeight = double.tryParse(_actualWeightController.text) ?? 1.0;
        actualQuantity = (unitWeight > 0) ? (totalWeight * 1000 / unitWeight).floor() : 0;
      } else {
        final totalProduced = int.tryParse(_totalProducedController.text) ?? 0;
        final damagedCount = int.tryParse(_damagedCountController.text) ?? 0;
        actualQuantity = totalProduced - damagedCount;
      }

      // Duration_actual = (Quantity / CC) * CycleTime
      final actualProductionTimeSeconds = (actualQuantity / cavityCount) * actualCycleTime;
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
                : (int.tryParse(_totalProducedController.text) ?? 0),
            damagedCount: _isWeightBased
                ? null
                : (int.tryParse(_damagedCountController.text) ?? 0),
            totalWeightKg: _isWeightBased
                ? (double.tryParse(_totalWeightController.text) ?? 0.0)
                : null,
            actualCycleTimeSeconds:
                double.tryParse(_actualCycleTimeController.text) ?? 0.0,
            actualWeightGrams: (double.tryParse(_actualWeightController.text) ?? 0.0),
            downtimeMinutes: downtimeMinutes,
            downtimeReason: _downtimeReasonController.text.isNotEmpty
                ? _downtimeReasonController.text
                : null,
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
                Text('Tub Production Entry Guide',
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
    final isSubmitting = ref.watch(productionSubmissionProvider).isLoading;
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('New Tub Production Entry'),
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
                      const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
                  decoration: BoxDecoration(
                    color: colorScheme.surface,
                    borderRadius: BorderRadius.circular(32),
                    border: Border.all(color: colorScheme.outline, width: 1.5),
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
                        borderRadius: BorderRadius.circular(32)),
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
                        padding: const EdgeInsets.symmetric(
                            horizontal: 24, vertical: 20),
                        decoration: BoxDecoration(
                          color: colorScheme.surface,
                          border: Border.all(
                              color: colorScheme.outline, width: 1.5),
                          borderRadius: BorderRadius.circular(32),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Start Time',
                                style: TextStyle(
                                    fontSize: 12,
                                    color: colorScheme.onSurfaceVariant)),
                            const SizedBox(height: 4),
                            Text(
                                DateFormat.jm().format(DateTime(0, 0, 0,
                                    _startTime.hour, _startTime.minute)),
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
                        padding: const EdgeInsets.symmetric(
                            horizontal: 24, vertical: 20),
                        decoration: BoxDecoration(
                          color: colorScheme.surface,
                          border: Border.all(
                              color: colorScheme.outline, width: 1.5),
                          borderRadius: BorderRadius.circular(32),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('End Time',
                                style: TextStyle(
                                    fontSize: 12,
                                    color: colorScheme.onSurfaceVariant)),
                            const SizedBox(height: 4),
                            Text(
                                DateFormat.jm().format(DateTime(0, 0, 0,
                                    _endTime.hour, _endTime.minute)),
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
                data: (machines) {
                  final activeMachines = machines.where((m) => m.status == 'active').toList();
                  // Ensure _selectedMachineId is valid for the current list
                  final safeMachineId = activeMachines.any((m) => m.id == _selectedMachineId) 
                      ? _selectedMachineId 
                      : null;

                  return DropdownButtonFormField<String>(
                    isExpanded: true,
                    initialValue: safeMachineId,
                    decoration: const InputDecoration(
                      labelText: 'Machine',
                      prefixIcon: Icon(Icons.precision_manufacturing_outlined),
                    ),
                    items: activeMachines
                        .map((m) =>
                            DropdownMenuItem(value: m.id, child: Text(m.name)))
                        .toList(),
                    onChanged: (value) {
                      setState(() {
                        _selectedMachineId = value;
                        _selectedTemplateId = null;
                        _selectedProductId = null;
                        _actualCycleTimeController.clear();
                        _actualWeightController.clear();
                        _totalProducedController.clear();
                        _damagedCountController.clear();
                        _totalWeightController.clear();
                        _downtimeReasonController.clear();
                      });
                      _fetchLastSession();
                    },
                    validator: (value) => value == null ? 'Required' : null,
                  );
                },
                loading: () => const LinearProgressIndicator(),
                error: (error, _) => Text('Error: $error',
                    style: const TextStyle(color: Colors.red)),
              ),
              const SizedBox(height: 24),

              // Template Dropdown
              ref.watch(productTemplatesProvider).when(
                data: (templates) {
                  // Filter templates based on selected machine
                  List<ProductTemplate> filteredTemplates = templates;
                  if (_selectedMachineId != null) {
                    final machines = machinesAsync.value ?? [];
                    final selectedMachine = machines.firstWhere(
                      (m) => m.id == _selectedMachineId,
                      orElse: () => Machine(
                        id: '',
                        name: '',
                        type: 'extruder',
                        status: 'inactive',
                      ),
                    );
                    if (selectedMachine.id.isNotEmpty) {
                      filteredTemplates = templates
                          .where((t) => selectedMachine.allowedTemplateIds
                              .contains(t.id))
                          .toList();
                    }
                  }

                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      DropdownButtonFormField<String>(
                        isExpanded: true,
                        initialValue: filteredTemplates.any((t) => t.id == _selectedTemplateId) 
                            ? _selectedTemplateId 
                            : null,
                        decoration: const InputDecoration(
                          labelText: 'Tub Template',
                          prefixIcon: Icon(Icons.category_outlined),
                        ),
                        items: filteredTemplates
                            .map((t) => DropdownMenuItem(
                                  value: t.id,
                                  child: Text(t.displayName),
                                ))
                            .toList(),
                        onChanged: (value) {
                          setState(() {
                            _selectedTemplateId = value;
                            _selectedProductId = null;
                            
                            if (value != null) {
                              final template = filteredTemplates.firstWhere(
                                (t) => t.id == value,
                                orElse: () => filteredTemplates.isNotEmpty 
                                    ? filteredTemplates.first 
                                    : templates.first, // templates is from .when data
                              );
                              _actualWeightController.text = template.weightGrams.toString();
                              
                              final machines = machinesAsync.value ?? [];
                              final activeMachines = machines.where((m) => m.status == 'active').toList();
                              
                              if (machines.isEmpty) return; // Cannot find machine if list is empty

                              final selectedMachine = machines.firstWhere(
                                (m) => m.id == _selectedMachineId,
                                orElse: () => activeMachines.isNotEmpty 
                                    ? activeMachines.first 
                                    : machines.first,
                              );
                              final cycleTime = selectedMachine.templateCycleTimes[value];
                              if (cycleTime != null) {
                                _actualCycleTimeController.text = cycleTime.toString();
                              }
                            }
                          });
                        },
                        validator: (value) => value == null ? 'Required' : null,
                      ),
                      if (_selectedMachineId != null &&
                          filteredTemplates.isEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 8.0, left: 12.0),
                          child: Text(
                            'Note: No templates configured for this machine.',
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.error,
                              fontSize: 12,
                            ),
                          ),
                        ),
                      if (_selectedMachineId != null &&
                          filteredTemplates.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 8.0, left: 12.0),
                          child: Text(
                            'Showing templates linked to this machine.',
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.primary,
                              fontSize: 12,
                            ),
                          ),
                        ),
                    ],
                  );
                },
                loading: () => const LinearProgressIndicator(),
                error: (error, _) => Text('Error: $error',
                    style: const TextStyle(color: Colors.red)),
              ),
              const SizedBox(height: 24),

              // Color Variant Dropdown (Visible only if Template is selected)
              if (_selectedTemplateId != null) ...[
                ref.watch(productTemplatesProvider).when(
                      data: (templates) {
                        final selectedTemplate = templates.any((t) => t.id == _selectedTemplateId)
                            ? templates.firstWhere((t) => t.id == _selectedTemplateId)
                            : null;
                        
                        // If for some reason the selected template is not in the list, hide the variant dropdown
                        if (selectedTemplate == null) return const SizedBox.shrink();

                        final variants = selectedTemplate.variants;

                        final safeProductId = variants.any((v) => v.id == _selectedProductId)
                            ? _selectedProductId
                            : null;

                        return DropdownButtonFormField<String>(
                          isExpanded: true,
                          initialValue: safeProductId,
                          decoration: const InputDecoration(
                            labelText: 'Color Variant',
                            prefixIcon: Icon(Icons.palette_outlined),
                          ),
                          items: variants
                              .map((v) => DropdownMenuItem(
                                    value: v.id,
                                    child: Text(v.color),
                                  ))
                              .toList(),
                          onChanged: (value) {
                            setState(() {
                              _selectedProductId = value;
                              final variant = variants.firstWhere(
                                (v) => v.id == value,
                                orElse: () => variants.isNotEmpty ? variants.first : selectedTemplate.variants.first,
                              );
                              _isWeightBased =
                                  variant.countingMethod == 'weight_based';
                              
                              // Use variant weight if it differs or to be sure
                              if (variant.weightGrams > 0) {
                                _actualWeightController.text = variant.weightGrams.toString();
                              }
                            });
                          },
                          validator: (value) =>
                              value == null ? 'Required' : null,
                        );
                      },
                      loading: () => const SizedBox.shrink(),
                      error: (error, _) => const SizedBox.shrink(),
                    ),
                const SizedBox(height: 24),
              ],

              // Conditional: Weight-based OR Unit-count
              if (_isWeightBased) ...[
                TextFormField(
                  controller: _totalWeightController,
                  decoration: const InputDecoration(
                    labelText: 'Total Weight (kg)',
                    prefixIcon: Icon(Icons.scale),
                    suffixText: 'kg',
                  ),
                  onChanged: (value) => setState(() {}),
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
                  onChanged: (value) => setState(() {}),
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
                  onChanged: (value) => setState(() {}),
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
                onChanged: (value) => setState(() {}),
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
                onChanged: (value) => setState(() {}),
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                validator: (value) =>
                    value == null || value.isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 24),

              // Downtime Reason (conditional)
              Builder(
                builder: (context) {
                  final hasProduct = _selectedProductId != null;
                  final hasInput = _isWeightBased 
                      ? _totalWeightController.text.isNotEmpty 
                      : _totalProducedController.text.isNotEmpty;
                  final shouldCalculate = hasProduct && hasInput;

                  final shiftHours = _calculateShiftDuration();
                  final actualCycleTime = double.tryParse(_actualCycleTimeController.text) ?? 0;
                  
                  int actualQuantity = 0;
                  if (_isWeightBased) {
                    final totalWeight = double.tryParse(_totalWeightController.text) ?? 0;
                    final unitWeight = double.tryParse(_actualWeightController.text) ?? 1;
                    actualQuantity = (unitWeight > 0) ? (totalWeight * 1000 / unitWeight).floor() : 0;
                  } else {
                    final totalProduced = int.tryParse(_totalProducedController.text) ?? 0;
                    final damagedCount = int.tryParse(_damagedCountController.text) ?? 0;
                    actualQuantity = totalProduced - damagedCount;
                  }
                  
                  final actualProductionTimeSeconds = actualQuantity * actualCycleTime;
                  final shiftDurationSeconds = shiftHours * 3600;
                  
                  final downtimeMinutes = shouldCalculate 
                      ? ((shiftDurationSeconds - actualProductionTimeSeconds) / 60).floor().clamp(0, 1440)
                      : 0;
                  
                  final isRequired = shouldCalculate && downtimeMinutes >= 30;

                  return TextFormField(
                    controller: _downtimeReasonController,
                    decoration: InputDecoration(
                      labelText: isRequired
                          ? 'Downtime Reason (Required: ${downtimeMinutes}m)'
                          : 'Downtime Reason (Optional)',
                      prefixIcon: const Icon(Icons.report_problem_outlined),
                      helperText: isRequired
                          ? 'Reason required for downtime ≥ 30 mins'
                          : null,
                      helperStyle: isRequired ? TextStyle(color: Theme.of(context).colorScheme.error) : null,
                    ),
                    maxLines: 2,
                    validator: (val) {
                      if (isRequired && (val == null || val.trim().isEmpty)) {
                        return 'Please enter a reason for the downtime';
                      }
                      return null;
                    },
                  );
                },
              ),
              const SizedBox(height: 48),

              // Submit Buttons
              FilledButton.icon(
                onPressed: isSubmitting
                    ? null
                    : () => _submit(saveAndAddAnother: false),
                style: FilledButton.styleFrom(
                  minimumSize: const Size(double.infinity, 64),
                ),
                icon: isSubmitting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                            color: Colors.white, strokeWidth: 2),
                      )
                    : const Icon(Icons.check),
                label:
                    Text(isSubmitting ? 'Submitting...' : 'Submit Tub Production'),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: isSubmitting
                    ? null
                    : () => _submit(saveAndAddAnother: true),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size(double.infinity, 64),
                  shape: const StadiumBorder(),
                  side: BorderSide(color: colorScheme.outline, width: 1.5),
                ),
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
