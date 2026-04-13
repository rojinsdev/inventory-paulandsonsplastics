import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../data/models/cap_model.dart';
import '../data/models/cap_template_model.dart';
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
  bool _isWeightBased = true; // Added toggle state

  final _totalWeightController = TextEditingController();
  final _totalProducedController = TextEditingController();
  final _actualCycleTimeController = TextEditingController();
  final _actualWeightController = TextEditingController();
  final _remarksController = TextEditingController();
  final _downtimeReasonController = TextEditingController();


  @override
  void initState() {
    super.initState();

    final now = DateTime.now();
    final hour = now.hour;

    if (hour >= 8 && hour < 20) {
      _shiftNumber = 1;
      _startTime = const TimeOfDay(hour: 8, minute: 0);
      _endTime = const TimeOfDay(hour: 20, minute: 0);
    } else {
      _shiftNumber = 2;
      _startTime = const TimeOfDay(hour: 20, minute: 0);
      _endTime = const TimeOfDay(hour: 8, minute: 0);
    }

    WidgetsBinding.instance.addPostFrameCallback((_) {
      final lastEntry = ref.read(lastEntryProvider);
      
      if (lastEntry != null && 
          lastEntry.shiftNumber == _shiftNumber &&
          lastEntry.date.day == _selectedDate.day &&
          lastEntry.date.month == _selectedDate.month) {
        
        setState(() {
          final parts = lastEntry.endTime.split(':');
          if (parts.length == 2) {
            final hour = int.parse(parts[0]);
            final minute = int.parse(parts[1]);

            // 1. Boundary check: If last session ended at or after shift boundary,
            // don't apply sticky start; keep default shift start.
            bool isAtShiftEnd = false;
            if (_shiftNumber == 1) {
              if (hour >= 20) isAtShiftEnd = true;
            } else {
              if (hour >= 8 && hour < 20) isAtShiftEnd = true;
            }

            if (isAtShiftEnd) return;

            _startTime = TimeOfDay(hour: hour, minute: minute);

            // 2. Adjust end time to shift boundary
            if (_shiftNumber == 1) {
              _endTime = const TimeOfDay(hour: 20, minute: 0);
            } else {
              _endTime = const TimeOfDay(hour: 8, minute: 0);
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

    if (_shiftNumber == 2 && endMinutes < startMinutes) {
      endMinutes += 24 * 60;
    }

    return (endMinutes - startMinutes) / 60.0;
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
          const SnackBar(content: Text('Please select a cap color')),
        );
        return;
      }

      final shiftDuration = _calculateShiftDuration();
      if (shiftDuration <= 0) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Invalid shift times'),
            backgroundColor: Colors.red,
          ),
        );
        return;
      }

      ref.read(productionSubmissionProvider.notifier).submitCap(
            capId: _selectedCapId!,
            machineId: _selectedMachineId!,
            shiftNumber: _shiftNumber,
            startTime: '${_startTime.hour.toString().padLeft(2, '0')}:${_startTime.minute.toString().padLeft(2, '0')}',
            endTime: '${_endTime.hour.toString().padLeft(2, '0')}:${_endTime.minute.toString().padLeft(2, '0')}',
            totalWeightKg: _isWeightBased && _totalWeightController.text.isNotEmpty ? double.parse(_totalWeightController.text) : null,
            totalProduced: !_isWeightBased && _totalProducedController.text.isNotEmpty ? int.parse(_totalProducedController.text) : null,
            actualCycleTimeSeconds: double.parse(_actualCycleTimeController.text),
            actualWeightGrams: double.parse(_actualWeightController.text),
            remarks: _remarksController.text.isNotEmpty ? _remarksController.text : null,
            downtimeMinutes: _calculateDowntime(),
            downtimeReason: _downtimeReasonController.text.isNotEmpty ? _downtimeReasonController.text : null,
            date: _selectedDate,
          );
    }
  }

  int _calculateDowntime() {
    final shiftHours = _calculateShiftDuration();
    final actualCycleTime = double.tryParse(_actualCycleTimeController.text) ?? 0;
    if (actualCycleTime == 0) return 0;

    final mappings = ref.read(capMappingsProvider).value ?? [];
    final mapping = mappings.firstWhere(
      (m) => m.machineId == _selectedMachineId && m.capTemplateId == _selectedTemplateId,
      orElse: () => CapMapping(id: '', machineId: '', capTemplateId: '', idealCycleTimeSeconds: 10, cavityCount: 1),
    );
    final cavityCount = mapping.cavityCount > 0 ? mapping.cavityCount : 1;

    int actualQuantity = 0;
    if (_isWeightBased) {
      final totalWeight = double.tryParse(_totalWeightController.text) ?? 0;
      final unitWeight = double.tryParse(_actualWeightController.text) ?? 1;
      actualQuantity = (unitWeight > 0) ? (totalWeight * 1000 / unitWeight).floor() : 0;
    } else {
      actualQuantity = int.tryParse(_totalProducedController.text) ?? 0;
    }

    final actualProductionTimeSeconds = (actualQuantity / cavityCount) * actualCycleTime;
    final shiftDurationSeconds = shiftHours * 3600;
    return ((shiftDurationSeconds - actualProductionTimeSeconds) / 60).floor().clamp(0, 1440);
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
                Icon(Icons.help_outline, color: Theme.of(context).colorScheme.primary, size: 28),
                const SizedBox(width: 12),
                Text('Cap Production Guide', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
              ],
            ),
            const SizedBox(height: 24),
            _buildGuideItem(Icons.scale_outlined, 'Total Weight', 'The total weight produced in KG.'),
            _buildGuideItem(Icons.timer_outlined, 'Cycle Time', 'Cycle time from the machine display.'),
            _buildGuideItem(Icons.monitor_weight_outlined, 'Unit Weight', 'Weight of a single cap in grams.'),
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
          Icon(icon, size: 20, color: Theme.of(context).colorScheme.primary),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
                Text(description, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
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
    final machinesState = ref.watch(machinesProvider);
    final mappingsState = ref.watch(capMappingsProvider);
    final templatesState = ref.watch(capTemplatesProvider);
    final colorScheme = Theme.of(context).colorScheme;

    ref.listen<AsyncValue<bool>>(productionSubmissionProvider, (previous, next) {
      next.whenOrNull(
        data: (success) {
          if (previous?.isLoading ?? false) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Logged successfully'), behavior: SnackBarBehavior.floating));
            if (success == false) context.pop();
          }
        },
        error: (err, _) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(err.toString().replaceAll('Exception: ', '')),
          backgroundColor: colorScheme.error,
          behavior: SnackBarBehavior.floating,
        )),
      );
    });

    return Scaffold(
      appBar: AppBar(
        title: const Text('New Cap Production'),
        actions: [IconButton(onPressed: _showHelpGuide, icon: const Icon(Icons.help_outline))],
      ),
      body: capsState.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => Center(child: Text('Error: $err')),
        data: (_) => SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Date Selection
                InkWell(
                  onTap: _selectDate,
                  borderRadius: BorderRadius.circular(16),
                  child: Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      border: Border.all(color: colorScheme.outlineVariant),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Production Date', style: TextStyle(fontSize: 12)),
                            Text(DateFormat('EEEE, MMM d').format(_selectedDate), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                          ],
                        ),
                        const Icon(Icons.calendar_today),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 24),

                // Shift Selection
                SegmentedButton<int>(
                  segments: const [
                    ButtonSegment(value: 1, label: Text('Shift 1'), icon: Icon(Icons.wb_sunny_outlined)),
                    ButtonSegment(value: 2, label: Text('Shift 2'), icon: Icon(Icons.nights_stay_outlined)),
                  ],
                  selected: {_shiftNumber},
                  onSelectionChanged: (set) => setState(() {
                    _shiftNumber = set.first;
                    if (_shiftNumber == 1) {
                      _startTime = const TimeOfDay(hour: 8, minute: 0);
                      _endTime = const TimeOfDay(hour: 20, minute: 0);
                    } else {
                      _startTime = const TimeOfDay(hour: 20, minute: 0);
                      _endTime = const TimeOfDay(hour: 8, minute: 0);
                    }
                  }),
                ),
                const SizedBox(height: 24),

                // Time Pickers
                Row(
                  children: [
                    Expanded(
                      child: InkWell(
                        onTap: () => _selectTime(true),
                        child: Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(border: Border.all(color: colorScheme.outlineVariant), borderRadius: BorderRadius.circular(12)),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Start Time', style: TextStyle(fontSize: 12)),
                              Text(DateFormat.jm().format(DateTime(0, 0, 0, _startTime.hour, _startTime.minute)), style: const TextStyle(fontWeight: FontWeight.bold)),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: InkWell(
                        onTap: () => _selectTime(false),
                        child: Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(border: Border.all(color: colorScheme.outlineVariant), borderRadius: BorderRadius.circular(12)),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('End Time', style: TextStyle(fontSize: 12)),
                              Text(DateFormat.jm().format(DateTime(0, 0, 0, _endTime.hour, _endTime.minute)), style: const TextStyle(fontWeight: FontWeight.bold)),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 32),

                // Machine Selection
                machinesState.when(
                  data: (machines) => DropdownButtonFormField<String>(
                    value: _selectedMachineId,
                    decoration: const InputDecoration(labelText: 'Machine', prefixIcon: Icon(Icons.settings)),
                    items: machines.map((m) => DropdownMenuItem(value: m.id, child: Text(m.name))).toList(),
                    onChanged: (val) => setState(() {
                      _selectedMachineId = val;
                      _selectedTemplateId = null;
                      _selectedCapId = null;
                    }),
                    validator: (v) => v == null ? 'Required' : null,
                  ),
                  loading: () => const LinearProgressIndicator(),
                  error: (e, _) => Text('Error loading machines: $e'),
                ),
                const SizedBox(height: 24),

                // Cap Selection
                if (_selectedMachineId != null)
                  mappingsState.when(
                    data: (mappings) {
                      final machineMappings = mappings.where((m) => m.machineId == _selectedMachineId).toList();
                      return templatesState.when(
                        data: (List<CapTemplate> templates) {
                          final allowedIds = machineMappings.map((m) => m.capTemplateId).toSet();
                          final filtered = templates.where((t) => allowedIds.contains(t.id)).toList();
                          if (filtered.isEmpty) return const Text('No caps mapped to this machine', style: TextStyle(color: Colors.orange));
                          return DropdownButtonFormField<String>(
                            value: _selectedTemplateId,
                            decoration: const InputDecoration(labelText: 'Cap Type', prefixIcon: Icon(Icons.category)),
                            items: filtered.map((t) => DropdownMenuItem(value: t.id, child: Text(t.displayName))).toList(),
                            onChanged: (val) => setState(() {
                              _selectedTemplateId = val;
                              _selectedCapId = null;
                              final m = machineMappings.firstWhere((map) => map.capTemplateId == val);
                              _actualCycleTimeController.text = m.idealCycleTimeSeconds.toString();
                            }),
                            validator: (v) => v == null ? 'Required' : null,
                          );
                        },
                        loading: () => const LinearProgressIndicator(),
                        error: (e, _) => Text('Error: $e'),
                      );
                    },
                    loading: () => const LinearProgressIndicator(),
                    error: (e, _) => Text('Error: $e'),
                  ),
                const SizedBox(height: 24),

                // Color Selection
                if (_selectedTemplateId != null)
                  templatesState.when(
                    data: (List<CapTemplate> templates) {
                      final t = templates.firstWhere((x) => x.id == _selectedTemplateId);
                      return DropdownButtonFormField<String>(
                        value: _selectedCapId,
                        decoration: const InputDecoration(labelText: 'Color', prefixIcon: Icon(Icons.palette)),
                        items: t.variants.map((v) => DropdownMenuItem(value: v.id, child: Text(v.color ?? 'Standard'))).toList(),
                        onChanged: (val) => setState(() {
                          _selectedCapId = val;
                          final Cap v = t.variants.firstWhere((varnt) => varnt.id == val);
                          _actualWeightController.text = v.idealWeightGrams.toString();
                        }),
                        validator: (v) => v == null ? 'Required' : null,
                      );
                    },
                    loading: () => const SizedBox.shrink(),
                    error: (e, _) => const SizedBox.shrink(),
                  ),
                const SizedBox(height: 32),

                const Text('Production Details', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                const SizedBox(height: 16),
                
                // Toggle for Weight vs Count
                SegmentedButton<bool>(
                  segments: const [
                    ButtonSegment(value: true, label: Text('By Weight'), icon: Icon(Icons.scale)),
                    ButtonSegment(value: false, label: Text('By Count'), icon: Icon(Icons.pin)),
                  ],
                  selected: {_isWeightBased},
                  onSelectionChanged: (set) => setState(() => _isWeightBased = set.first),
                ),
                const SizedBox(height: 24),

                if (_isWeightBased)
                  TextFormField(
                    controller: _totalWeightController,
                    decoration: const InputDecoration(
                      labelText: 'Total Weight (kg)', 
                      prefixIcon: Icon(Icons.scale),
                      suffixText: 'kg',
                    ),
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    onChanged: (_) => setState(() {}),
                    validator: (v) => (_isWeightBased && (v == null || v.isEmpty)) ? 'Required' : null,
                  )
                else
                  TextFormField(
                    controller: _totalProducedController,
                    decoration: const InputDecoration(
                      labelText: 'Total Produced (Units)', 
                      prefixIcon: Icon(Icons.pin),
                      suffixText: 'units',
                    ),
                    keyboardType: TextInputType.number,
                    onChanged: (_) => setState(() {}),
                    validator: (v) => (!_isWeightBased && (v == null || v.isEmpty)) ? 'Required' : null,
                  ),
                const SizedBox(height: 16),
                
                Row(
                  children: [
                    Expanded(
                      child: TextFormField(
                        controller: _actualCycleTimeController,
                        decoration: const InputDecoration(labelText: 'Cycle Time (s)', suffixText: 's'),
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        onChanged: (_) => setState(() {}),
                        validator: (v) => (v == null || v.isEmpty) ? 'Required' : null,
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: TextFormField(
                        controller: _actualWeightController,
                        decoration: const InputDecoration(labelText: 'Unit Weight (g)', suffixText: 'g'),
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        onChanged: (_) => setState(() {}),
                        validator: (v) => (v == null || v.isEmpty) ? 'Required' : null,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 32),

                // Downtime Section
                Builder(builder: (context) {
                  final dt = _calculateDowntime();
                  final isRequired = dt >= 30;
                  return TextFormField(
                    controller: _downtimeReasonController,
                    decoration: InputDecoration(
                      labelText: isRequired
                          ? 'Downtime reasons (Required: ${dt}m)'
                          : 'Downtime reasons (Optional)',
                      prefixIcon: const Icon(Icons.report_problem_outlined),
                      helperText: isRequired
                          ? 'Reason required for downtime ≥ 30 mins'
                          : null,
                      helperStyle: isRequired ? TextStyle(color: colorScheme.error) : null,
                    ),
                    maxLines: 2,
                    validator: (val) {
                      if (isRequired && (val == null || val.trim().isEmpty)) {
                        return 'Please enter a reason for the downtime';
                      }
                      return null;
                    },
                  );
                }),
                const SizedBox(height: 24),

                TextFormField(controller: _remarksController, decoration: const InputDecoration(labelText: 'Remarks (Optional)')),
                const SizedBox(height: 48),

                FilledButton.icon(
                  onPressed: ref.watch(productionSubmissionProvider).isLoading ? null : _submit,
                  icon: const Icon(Icons.check),
                  label: const Text('Submit Production'),
                  style: FilledButton.styleFrom(minimumSize: const Size(double.infinity, 64)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
