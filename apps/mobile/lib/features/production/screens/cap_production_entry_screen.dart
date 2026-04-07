import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../core/widgets/multi_select_downtime_reason.dart';
import '../data/models/cap_mapping_model.dart';
import '../providers/master_data_provider.dart';
import '../providers/production_provider.dart';

class CapProductionEntryScreen extends ConsumerStatefulWidget {
  const CapProductionEntryScreen({super.key});

  @override
  ConsumerState<CapProductionEntryScreen> createState() =>
      _CapProductionEntryScreenState();
}

class _CapProductionEntryScreenState
    extends ConsumerState<CapProductionEntryScreen> {
  final _formKey = GlobalKey<FormState>();

  String? _selectedMachineId;
  String? _selectedTemplateId;
  String? _selectedCapId;
  int _shiftNumber = 1;
  DateTime _selectedDate = DateTime.now();
  TimeOfDay _startTime = const TimeOfDay(hour: 8, minute: 0);
  TimeOfDay _endTime = const TimeOfDay(hour: 20, minute: 0);

  final _totalWeightController = TextEditingController();
  final _totalProducedController = TextEditingController();
  final _actualCycleTimeController = TextEditingController();
  final _actualWeightController = TextEditingController();
  final _remarksController = TextEditingController();
  final _downtimeReasonController = TextEditingController();

  List<String> _selectedDowntimeReasons = [];

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

    // Apply sticky logic
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final lastEntry = ref.read(lastEntryProvider);
      
      // Only apply sticky logic if it's the SAME shift and same date
      // This prevents Shift 1 times from leaking into Shift 2 and vice versa
      if (lastEntry != null && 
          lastEntry.shiftNumber == _shiftNumber &&
          lastEntry.date.day == _selectedDate.day &&
          lastEntry.date.month == _selectedDate.month) {
        
        setState(() {
          final parts = lastEntry.endTime.split(':');
          if (parts.length == 2) {
            final hour = int.parse(parts[0]);
            final minute = int.parse(parts[1]);
            _startTime = TimeOfDay(hour: hour, minute: minute);
            
            // Default end time logically (e.g. 1 hour later, capped at shift boundary)
            int nextHour = (hour + 1) % 24;
            
            if (_shiftNumber == 1) {
              // Day Shift: Cap at 20:00
              int endHour = nextHour > 20 ? 20 : nextHour;
              // If we are already at 20:00, the shift is legally over or we hit a collision
              if (endHour == hour && endHour == 20) {
                 // Keep it at 20:00 but maybe the user is logging late
              }
              _endTime = TimeOfDay(hour: endHour, minute: minute);
            } else {
              // Night Shift: 20:00 to 08:00
              bool isPastBoundary = nextHour > 8 && nextHour < 20;
              int endHour = isPastBoundary ? 8 : nextHour;
              _endTime = TimeOfDay(hour: endHour, minute: minute);
            }

            // Final safety collision check
            if (_startTime.hour == _endTime.hour && _startTime.minute == _endTime.minute) {
              _endTime = TimeOfDay(
                hour: _endTime.hour,
                minute: (_endTime.minute + 15) % 60
              );
            }
          }
        });
      }
    });
  }

  @override
  void dispose() {
    _totalWeightController.dispose();
    _totalProducedController.dispose();
    _actualCycleTimeController.dispose();
    _actualWeightController.dispose();
    _remarksController.dispose();
    _downtimeReasonController.dispose();
    super.dispose();
  }

  Future<void> _selectDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(2020),
      lastDate: DateTime(2030),
    );
    if (picked != null) {
      setState(() => _selectedDate = picked);
    }
  }

  Future<void> _selectTime(bool isStart) async {
    final picked = await showTimePicker(
      context: context,
      initialTime: isStart ? _startTime : _endTime,
    );
    if (picked != null) {
      setState(() {
        if (isStart) {
          _startTime = picked;
        } else {
          _endTime = picked;
        }
      });
    }
  }

  double _calculateShiftDuration() {
    int startMinutes = _startTime.hour * 60 + _startTime.minute;
    int endMinutes = _endTime.hour * 60 + _endTime.minute;

    // Handle overnight shifts (Shift 2)
    if (_shiftNumber == 2 && endMinutes < startMinutes) {
      endMinutes += 24 * 60;
    }

    return (endMinutes - startMinutes) / 60.0; // Return hours
  }

  void _submit() {
    if (_formKey.currentState!.validate()) {
      if (_selectedMachineId == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Please select a machine')),
        );
        return;
      }

      if (_selectedCapId == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Please select a cap')),
        );
        return;
      }

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

      ref.read(productionSubmissionProvider.notifier).submitCap(
            capId: _selectedCapId!,
            machineId: _selectedMachineId!,
            shiftNumber: _shiftNumber,
            startTime:
                '${_startTime.hour.toString().padLeft(2, '0')}:${_startTime.minute.toString().padLeft(2, '0')}',
            endTime:
                '${_endTime.hour.toString().padLeft(2, '0')}:${_endTime.minute.toString().padLeft(2, '0')}',
            totalWeightKg: _totalWeightController.text.isNotEmpty
                ? double.parse(_totalWeightController.text)
                : null,
            totalProduced: _totalProducedController.text.isNotEmpty
                ? int.parse(_totalProducedController.text)
                : null,
            actualCycleTimeSeconds:
                double.parse(_actualCycleTimeController.text),
            actualWeightGrams: double.parse(_actualWeightController.text),
            remarks: _remarksController.text.isNotEmpty
                ? _remarksController.text
                : null,
            downtimeMinutes: () {
              final shiftHours = _calculateShiftDuration();
              final actualCycleTime = double.tryParse(_actualCycleTimeController.text) ?? 0;
              
              if (actualCycleTime == 0) return 0;

              // Find the cavity count for this machine-cap mapping
              final mappings = ref.read(capMappingsProvider).value ?? [];
              final mapping = mappings.firstWhere(
                (m) => m.machineId == _selectedMachineId && m.capTemplateId == _selectedTemplateId,
                orElse: () => CapMapping(
                  id: '', 
                  machineId: '', 
                  capTemplateId: '', 
                  idealCycleTimeSeconds: 10,
                  cavityCount: 1,
                ),
              );
              final cavityCount = mapping.cavityCount;

              int actualQuantity = 0;
              if (_totalWeightController.text.isNotEmpty) {
                final totalWeight = double.tryParse(_totalWeightController.text) ?? 0;
                final unitWeight = double.tryParse(_actualWeightController.text) ?? 1;
                actualQuantity = (unitWeight > 0) ? (totalWeight * 1000 / unitWeight).floor() : 0;
              } else {
                actualQuantity = int.tryParse(_totalProducedController.text) ?? 0;
              }

              // Duration = (Quantity / CavityCount) * CycleTime
              final actualProductionTimeSeconds = (actualQuantity / cavityCount) * actualCycleTime;
              final shiftDurationSeconds = shiftHours * 3600;
              return ((shiftDurationSeconds - actualProductionTimeSeconds) / 60).floor().clamp(0, 1440);
            }(),
            downtimeReason: _selectedDowntimeReasons.isNotEmpty
                ? _selectedDowntimeReasons.join(', ')
                : null,
            date: _selectedDate,
          );
    }
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
                Text('Cap Production Guide',
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.bold,
                        )),
              ],
            ),
            const SizedBox(height: 24),
            _buildGuideItem(
              Icons.scale_outlined,
              'Total Weight',
              'The total weight of caps produced in KG. Weigh all bags together for accuracy.',
            ),
            _buildGuideItem(
              Icons.timer_outlined,
              'Actual Cycle Time',
              'Read the cycle time from the cap machine display monitor.',
            ),
            _buildGuideItem(
              Icons.monitor_weight_outlined,
              'Unit Weight',
              'Measure weight of a single cap in grams. This is used for precise inventory calculations.',
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
    final capsState = ref.watch(capsProvider);
    final submissionState = ref.watch(productionSubmissionProvider);
    final isSubmitting = submissionState.isLoading;
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    // Listen for success/error
    ref.listen<AsyncValue<bool>>(productionSubmissionProvider,
        (previous, next) {
      next.whenOrNull(
        data: (success) {
          if (previous?.isLoading ?? false) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: const Text('Cap production logged successfully'),
                behavior: SnackBarBehavior.floating,
                margin: const EdgeInsets.all(20),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
            );
            if (success == false) {
              context.pop();
            }
          }
        },
        error: (err, _) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Error: $err'),
              backgroundColor: colorScheme.error,
              behavior: SnackBarBehavior.floating,
            ),
          );
        },
      );
    });

    return Scaffold(
      appBar: AppBar(
        title: const Text('New Cap Production'),
        actions: [
          IconButton(
            onPressed: _showHelpGuide,
            icon: const Icon(Icons.help_outline),
            tooltip: 'Help Guide',
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: capsState.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => Center(child: Text('Error: $err')),
        data: (caps) => SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Date Selection
                GestureDetector(
                  onTap: _selectDate,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 20, vertical: 24),
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
                        onTap: () => _selectTime(true),
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
                              Text(
                                  DateFormat.jm().format(DateTime(0, 0, 0,
                                      _startTime.hour, _startTime.minute)),
                                  style: const TextStyle(
                                      fontSize: 18,
                                      fontWeight: FontWeight.bold)),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: GestureDetector(
                        onTap: () => _selectTime(false),
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
                              Text(
                                  DateFormat.jm().format(DateTime(0, 0, 0,
                                      _endTime.hour, _endTime.minute)),
                                  style: const TextStyle(
                                      fontSize: 18,
                                      fontWeight: FontWeight.bold)),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                // Machine Selection
                ref.watch(machinesProvider).when(
                      data: (machines) => DropdownButtonFormField<String>(
                        initialValue: _selectedMachineId,
                        decoration: const InputDecoration(
                          labelText: 'Molding Machine',
                          prefixIcon: Icon(Icons.settings_input_component),
                        ),
                        items: machines
                            .map((m) => DropdownMenuItem(
                                  value: m.id,
                                  child: Text(m.name),
                                ))
                            .toList(),
                        onChanged: (value) {
                          setState(() {
                            _selectedMachineId = value;
                            _selectedTemplateId = null;
                            _selectedCapId = null;
                          });
                        },
                        validator: (value) => value == null ? 'Required' : null,
                      ),
                      loading: () => const LinearProgressIndicator(),
                      error: (error, _) => Text('Error: $error',
                          style: const TextStyle(color: Colors.red)),
                    ),
                const SizedBox(height: 24),

                // Cap Template Selection (Filtered by Machine Mapping)
                if (_selectedMachineId != null)
                  ref.watch(capMappingsProvider).when(
                        data: (mappings) {
                          final machineMappings = mappings
                              .where((m) => m.machineId == _selectedMachineId)
                              .toList();
                          
                          return ref.watch(capTemplatesProvider).when(
                                data: (templates) {
                                  // Only show templates that have a mapping for this machine
                                  final allowedTemplateIds = machineMappings
                                      .map((m) => m.capTemplateId)
                                      .toSet();
                                  final filteredTemplates = templates
                                      .where((t) => allowedTemplateIds.contains(t.id))
                                      .toList();

                                  if (filteredTemplates.isEmpty) {
                                    return const Padding(
                                      padding: EdgeInsets.all(8.0),
                                      child: Text(
                                        'No caps mapped to this machine. Please configure mappings in Web Admin.',
                                        style: TextStyle(color: Colors.orange, fontWeight: FontWeight.bold),
                                      ),
                                    );
                                  }

                                  return DropdownButtonFormField<String>(
                                    initialValue: _selectedTemplateId,
                                    decoration: const InputDecoration(
                                      labelText: 'Cap Template',
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
                                        _selectedCapId = null;
                                        
                                        // Set Ideal Cycle Time from Mapping
                                        final mapping = machineMappings.firstWhere(
                                            (m) => m.capTemplateId == value);
                                        _actualCycleTimeController.text =
                                            mapping.idealCycleTimeSeconds.toString();
                                      });
                                    },
                                    validator: (value) =>
                                        value == null ? 'Required' : null,
                                  );
                                },
                                loading: () => const LinearProgressIndicator(),
                                error: (error, _) => Text('Error: $error'),
                              );
                        },
                        loading: () => const LinearProgressIndicator(),
                        error: (error, _) => Text('Error: $error'),
                      ),
                const SizedBox(height: 24),

                // Cap Variant Selection (Color)
                if (_selectedTemplateId != null) ...[
                  ref.watch(capTemplatesProvider).when(
                        data: (templates) {
                          final selectedTemplate = templates
                              .firstWhere((t) => t.id == _selectedTemplateId);
                          final variants = selectedTemplate.variants;

                          return DropdownButtonFormField<String>(
                            initialValue: _selectedCapId,
                            decoration: const InputDecoration(
                              labelText: 'Cap Color',
                              prefixIcon: Icon(Icons.palette_outlined),
                            ),
                            items: variants
                                .map((v) => DropdownMenuItem(
                                      value: v.id,
                                      child: Text(v.color ?? 'Standard'),
                                    ))
                                .toList(),
                            onChanged: (value) {
                              setState(() {
                                _selectedCapId = value;
                                // Pre-fill ideal values (default)
                                final variant =
                                    variants.firstWhere((v) => v.id == value);
                                _actualCycleTimeController.text =
                                    variant.idealCycleTimeSeconds.toString();
                                _actualWeightController.text =
                                    variant.idealWeightGrams.toString();
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
                const SizedBox(height: 24),

                Text('Production Details',
                    style: theme.textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 16),

                // Total Weight
                TextFormField(
                  controller: _totalWeightController,
                  decoration: const InputDecoration(
                    labelText: 'Total Weight (kg)',
                    prefixIcon: Icon(Icons.scale),
                    suffixText: 'kg',
                    helperText: 'Optional if Total Produced is provided',
                  ),
                  onChanged: (value) => setState(() {}),
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  validator: (val) {
                    if ((val == null || val.isEmpty) &&
                        _totalProducedController.text.isEmpty) {
                      return 'Enter Weight or Total Produced';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 24),

                // Total Produced (Units)
                TextFormField(
                  controller: _totalProducedController,
                  decoration: const InputDecoration(
                    labelText: 'Total Produced (Units)',
                    prefixIcon: Icon(Icons.pin_outlined),
                    suffixText: 'units',
                    helperText: 'Optional if Total Weight is provided',
                  ),
                  onChanged: (value) => setState(() {}),
                  keyboardType: TextInputType.number,
                  validator: (val) {
                    if ((val == null || val.isEmpty) &&
                        _totalWeightController.text.isEmpty) {
                      return 'Enter Weight or Total Produced';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 24),

                // Cycle Time & Unit Weight Row
                Row(
                  children: [
                    Expanded(
                      child: TextFormField(
                        controller: _actualCycleTimeController,
                        decoration: const InputDecoration(
                          labelText: 'Actual Cycle Time',
                          prefixIcon: Icon(Icons.timer_outlined),
                          suffixText: 'seconds',
                          helperText: 'From machine display',
                        ),
                        onChanged: (value) => setState(() {}),
                        keyboardType: const TextInputType.numberWithOptions(
                            decimal: true),
                        validator: (val) =>
                            val == null || val.isEmpty ? 'Required' : null,
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: TextFormField(
                        controller: _actualWeightController,
                        decoration: const InputDecoration(
                          labelText: 'Actual Weight per Unit',
                          prefixIcon: Icon(Icons.monitor_weight_outlined),
                          suffixText: 'grams',
                          helperText: 'Measured weight',
                        ),
                        onChanged: (value) => setState(() {}),
                        keyboardType: const TextInputType.numberWithOptions(
                            decimal: true),
                        validator: (val) =>
                            val == null || val.isEmpty ? 'Required' : null,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                
                // Downtime System
                Builder(
                  builder: (context) {
                    final hasInput = _totalWeightController.text.isNotEmpty || _totalProducedController.text.isNotEmpty;
                    final hasProduct = _selectedCapId != null;
                    final shouldCalculate = hasProduct && hasInput;

                    final shiftHours = _calculateShiftDuration();
                    final actualCycleTime = double.tryParse(_actualCycleTimeController.text) ?? 0;
                    
                    int actualQuantity = 0;
                    if (_totalWeightController.text.isNotEmpty) {
                      final totalWeight = double.tryParse(_totalWeightController.text) ?? 0;
                      final unitWeight = double.tryParse(_actualWeightController.text) ?? 1;
                      actualQuantity = (unitWeight > 0) ? (totalWeight * 1000 / unitWeight).floor() : 0;
                    } else {
                      actualQuantity = int.tryParse(_totalProducedController.text) ?? 0;
                    }
                    
                    final actualProductionTimeSeconds = actualQuantity * actualCycleTime;
                    final shiftDurationSeconds = shiftHours * 3600;
                    
                    // If cycle time is 0, we don't have enough data to calculate downtime yet
                    final downtimeMinutes = (shouldCalculate && actualCycleTime > 0)
                        ? ((shiftDurationSeconds - actualProductionTimeSeconds) / 60).floor().clamp(0, 1440)
                        : 0;
                    
                    final isRequired = shouldCalculate && downtimeMinutes > 30;

                    return Column(
                      children: [
                        MultiSelectDowntimeReason(
                          initialValues: _selectedDowntimeReasons,
                          labelText: isRequired ? 'Downtime Reasons (Required: ${downtimeMinutes}m)' : 'Downtime Reasons (Optional: ${downtimeMinutes}m)',
                          helperText: isRequired ? 'Reason required for downtime > 30 mins' : null,
                          helperStyle: TextStyle(color: isRequired ? Theme.of(context).colorScheme.error : null),
                          onSelectionChanged: (selected) {
                            setState(() {
                              _selectedDowntimeReasons = selected;
                            });
                          },
                        ),
                        const SizedBox(height: 24),
                        if (_selectedDowntimeReasons.contains('Other')) ...[
                          const SizedBox(height: 16),
                          TextFormField(
                            controller: _downtimeReasonController,
                            decoration: const InputDecoration(
                              labelText: 'Specify Other Reason',
                              prefixIcon: Icon(Icons.edit_note),
                            ),
                            maxLines: 2,
                            validator: (value) {
                              if (isRequired && (value == null || value.trim().isEmpty)) {
                                return 'Please specify the reason';
                              }
                              return null;
                            },
                          ),
                        ],
                      ],
                    );
                  },
                ),
                const SizedBox(height: 24),

                // Remarks
                TextFormField(
                  controller: _remarksController,
                  decoration: const InputDecoration(
                    labelText: 'Remarks (Optional)',
                    prefixIcon: Icon(Icons.note_alt_outlined),
                    hintText: 'Any observations or issues...',
                  ),
                  maxLines: 2,
                ),
                const SizedBox(height: 48),

                FilledButton.icon(
                  onPressed: isSubmitting ? null : _submit,
                  icon: isSubmitting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                              color: Colors.white, strokeWidth: 2),
                        )
                      : const Icon(Icons.check),
                  label: Text(
                      isSubmitting ? 'Submitting...' : 'Submit Cap Production'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
