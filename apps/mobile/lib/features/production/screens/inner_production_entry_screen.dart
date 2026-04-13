import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../data/models/inner_model.dart';
import '../data/models/inner_template_model.dart';
import '../data/models/machine_model.dart';
import '../providers/master_data_provider.dart';
import '../providers/production_provider.dart';

class InnerProductionEntryScreen extends ConsumerStatefulWidget {
  const InnerProductionEntryScreen({super.key});

  @override
  ConsumerState<InnerProductionEntryScreen> createState() =>
      _InnerProductionEntryScreenState();
}

class _InnerProductionEntryScreenState
    extends ConsumerState<InnerProductionEntryScreen> {
  final _formKey = GlobalKey<FormState>();

  // Controllers
  final _totalProducedController = TextEditingController();
  final _totalWeightController = TextEditingController();
  final _actualCycleTimeController = TextEditingController();
  final _actualWeightController = TextEditingController();
  final _remarksController = TextEditingController();
  final _downtimeReasonController = TextEditingController();

  // State
  String? _selectedMachineId;
  String? _selectedTemplateId;
  String? _selectedInnerId; // Specific variant (Color)
  int _shiftNumber = 1;
  DateTime _selectedDate = DateTime.now();
  TimeOfDay _startTime = const TimeOfDay(hour: 8, minute: 0);
  TimeOfDay _endTime = const TimeOfDay(hour: 20, minute: 0);
  bool _isWeightBased = true; // Added toggle state for consistency

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

    // Apply sticky logic
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
    _totalProducedController.dispose();
    _totalWeightController.dispose();
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
            const SnackBar(content: Text('Please select a machine')));
        return;
      }
      if (_selectedInnerId == null) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Please select an inner color')));
        return;
      }

      ref.read(productionSubmissionProvider.notifier).submitInner(
            innerId: _selectedInnerId!,
            machineId: _selectedMachineId!,
            shiftNumber: _shiftNumber,
            startTime:
                '${_startTime.hour.toString().padLeft(2, '0')}:${_startTime.minute.toString().padLeft(2, '0')}',
            endTime:
                '${_endTime.hour.toString().padLeft(2, '0')}:${_endTime.minute.toString().padLeft(2, '0')}',
            totalWeightKg:
                _isWeightBased && _totalWeightController.text.isNotEmpty
                    ? double.parse(_totalWeightController.text)
                    : null,
            totalProduced:
                !_isWeightBased && _totalProducedController.text.isNotEmpty
                    ? int.parse(_totalProducedController.text)
                    : null,
            actualCycleTimeSeconds:
                double.parse(_actualCycleTimeController.text),
            actualWeightGrams: double.parse(_actualWeightController.text),
            remarks: _remarksController.text.isNotEmpty
                ? _remarksController.text
                : null,
            downtimeMinutes: _calculateDowntimeLocal(),
            downtimeReason: _downtimeReasonController.text.isNotEmpty
                ? _downtimeReasonController.text
                : null,
            date: _selectedDate,
          );
    }
  }

  int _calculateDowntimeLocal() {
    final shiftHours = _calculateShiftDuration();
    final actualCycleTime =
        double.tryParse(_actualCycleTimeController.text) ?? 0;
    if (actualCycleTime == 0) return 0;

    int actualQuantity = 0;
    if (_isWeightBased) {
      final totalWeight = double.tryParse(_totalWeightController.text) ?? 0;
      final unitWeight = double.tryParse(_actualWeightController.text) ?? 1;
      actualQuantity =
          (unitWeight > 0) ? (totalWeight * 1000 / unitWeight).floor() : 0;
    } else {
      actualQuantity = int.tryParse(_totalProducedController.text) ?? 0;
    }

    int cavityCount = 1;
    if (_selectedInnerId != null) {
      final templates = ref.read(innerTemplatesProvider).value ?? [];
      Inner? selectedVariant;
      for (final t in templates) {
        for (final v in t.variants) {
          if (v.id == _selectedInnerId) {
            selectedVariant = v;
            break;
          }
        }
        if (selectedVariant != null) break;
      }
      cavityCount = selectedVariant?.cavityCount ?? 1;
    }

    final actualProductionTimeSeconds =
        (actualQuantity / cavityCount) * actualCycleTime;
    final shiftDurationSeconds = shiftHours * 3600;

    return ((shiftDurationSeconds - actualProductionTimeSeconds) / 60)
        .floor()
        .clamp(0, 1440);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final isSubmitting = ref.watch(productionSubmissionProvider).isLoading;

    ref.listen<AsyncValue<bool>>(productionSubmissionProvider,
        (previous, next) {
      next.whenOrNull(
        data: (success) {
          if (previous?.isLoading ?? false) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                content: Text('Logged successfully'),
                behavior: SnackBarBehavior.floating));
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
      appBar: AppBar(title: const Text('New Inner Production')),
      body: SingleChildScrollView(
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
                          const Text('Production Date',
                              style: TextStyle(fontSize: 12)),
                          Text(DateFormat('EEEE, MMM d').format(_selectedDate),
                              style: const TextStyle(
                                  fontSize: 18, fontWeight: FontWeight.bold)),
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
                  ButtonSegment(
                      value: 1,
                      label: Text('Shift 1'),
                      icon: Icon(Icons.wb_sunny_outlined)),
                  ButtonSegment(
                      value: 2,
                      label: Text('Shift 2'),
                      icon: Icon(Icons.nights_stay_outlined)),
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
                        decoration: BoxDecoration(
                            border:
                                Border.all(color: colorScheme.outlineVariant),
                            borderRadius: BorderRadius.circular(12)),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Start Time',
                                style: TextStyle(fontSize: 12)),
                            Text(
                                DateFormat.jm().format(DateTime(0, 0, 0,
                                    _startTime.hour, _startTime.minute)),
                                style: const TextStyle(
                                    fontWeight: FontWeight.bold)),
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
                        decoration: BoxDecoration(
                            border:
                                Border.all(color: colorScheme.outlineVariant),
                            borderRadius: BorderRadius.circular(12)),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('End Time',
                                style: TextStyle(fontSize: 12)),
                            Text(
                                DateFormat.jm().format(DateTime(
                                    0, 0, 0, _endTime.hour, _endTime.minute)),
                                style: const TextStyle(
                                    fontWeight: FontWeight.bold)),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 32),

              // Machine Selector
              ref.watch(machinesProvider).when(
                data: (List<Machine> machines) {
                  final active = machines.where((m) => m.status == 'active').toList();
                  return DropdownButtonFormField<String>(
                    value: _selectedMachineId,
                    decoration: const InputDecoration(
                        labelText: 'Machine',
                        prefixIcon: Icon(Icons.precision_manufacturing_outlined)),
                    items: active
                        .map((m) => DropdownMenuItem(
                            value: m.id, child: Text(m.name)))
                        .toList(),
                    onChanged: (value) => setState(() => _selectedMachineId = value),
                    validator: (value) => value == null ? 'Required' : null,
                  );
                },
                loading: () => const LinearProgressIndicator(),
                error: (error, _) => Text('Error loading machines: $error',
                    style: const TextStyle(color: Colors.red)),
              ),
              const SizedBox(height: 24),

              ref.watch(innerTemplatesProvider).when(
                    data: (List<InnerTemplate> templates) =>
                        DropdownButtonFormField<String>(
                      value: _selectedTemplateId,
                      decoration: const InputDecoration(
                          labelText: 'Inner Template',
                          prefixIcon: Icon(Icons.category_outlined)),
                      items: templates
                          .map((t) => DropdownMenuItem(
                              value: t.id, child: Text(t.displayName)))
                          .toList(),
                      onChanged: (value) => setState(() {
                        _selectedTemplateId = value;
                        _selectedInnerId = null;
                      }),
                      validator: (value) => value == null ? 'Required' : null,
                    ),
                    loading: () => const LinearProgressIndicator(),
                    error: (error, _) => Text('Error: $error',
                        style: const TextStyle(color: Colors.red)),
                  ),
              const SizedBox(height: 24),

              if (_selectedTemplateId != null)
                ref.watch(innerTemplatesProvider).when(
                      data: (List<InnerTemplate> templates) {
                        final selectedTemplate = templates
                            .firstWhere((t) => t.id == _selectedTemplateId);
                        final variants = selectedTemplate.variants;
                        return DropdownButtonFormField<String>(
                          value: _selectedInnerId,
                          decoration: const InputDecoration(
                              labelText: 'Inner Color',
                              prefixIcon: Icon(Icons.palette_outlined)),
                          items: variants
                              .map((v) => DropdownMenuItem(
                                  value: v.id,
                                  child: Text(v.color ?? 'Standard')))
                              .toList(),
                          onChanged: (value) {
                            setState(() {
                              _selectedInnerId = value;
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
              const SizedBox(height: 32),

              Text('Production Details',
                  style: theme.textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.bold)),
              const SizedBox(height: 16),

              SegmentedButton<bool>(
                segments: const [
                  ButtonSegment(
                      value: true,
                      label: Text('By Weight'),
                      icon: Icon(Icons.scale)),
                  ButtonSegment(
                      value: false,
                      label: Text('By Count'),
                      icon: Icon(Icons.pin)),
                ],
                selected: {_isWeightBased},
                onSelectionChanged: (set) =>
                    setState(() => _isWeightBased = set.first),
              ),
              const SizedBox(height: 24),

              if (_isWeightBased)
                TextFormField(
                  controller: _totalWeightController,
                  decoration: const InputDecoration(
                      labelText: 'Total Weight (kg)',
                      prefixIcon: Icon(Icons.scale),
                      suffixText: 'kg'),
                  onChanged: (value) => setState(() {}),
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  validator: (val) =>
                      (_isWeightBased && (val == null || val.isEmpty))
                          ? 'Required'
                          : null,
                )
              else
                TextFormField(
                  controller: _totalProducedController,
                  decoration: const InputDecoration(
                      labelText: 'Total Produced (Units)',
                      prefixIcon: Icon(Icons.pin),
                      suffixText: 'units'),
                  onChanged: (value) => setState(() {}),
                  keyboardType: TextInputType.number,
                  validator: (val) =>
                      (!_isWeightBased && (val == null || val.isEmpty))
                          ? 'Required'
                          : null,
                ),
              const SizedBox(height: 24),

              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _actualCycleTimeController,
                      decoration: const InputDecoration(
                          labelText: 'Cycle Time (s)',
                          prefixIcon: Icon(Icons.timer_outlined),
                          suffixText: 's'),
                      onChanged: (value) => setState(() {}),
                      keyboardType:
                          const TextInputType.numberWithOptions(decimal: true),
                      validator: (val) =>
                          val == null || val.isEmpty ? 'Required' : null,
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: TextFormField(
                      controller: _actualWeightController,
                      decoration: const InputDecoration(
                          labelText: 'Unit Weight (g)',
                          prefixIcon: Icon(Icons.monitor_weight_outlined),
                          suffixText: 'g'),
                      onChanged: (value) => setState(() {}),
                      keyboardType:
                          const TextInputType.numberWithOptions(decimal: true),
                      validator: (val) =>
                          val == null || val.isEmpty ? 'Required' : null,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 32),

              Builder(
                builder: (context) {
                  final dt = _calculateDowntimeLocal();
                  final isRequired = dt >= 30;
                  return TextFormField(
                    controller: _downtimeReasonController,
                    decoration: InputDecoration(
                      labelText: isRequired
                          ? 'Downtime Reason (Required: ${dt}m)'
                          : 'Downtime Reason (Optional)',
                      prefixIcon: const Icon(Icons.report_problem_outlined),
                      helperText: isRequired
                          ? 'Reason required for downtime ≥ 30 mins'
                          : null,
                      helperStyle: isRequired
                          ? TextStyle(color: colorScheme.error)
                          : null,
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
              const SizedBox(height: 24),

              TextFormField(
                  controller: _remarksController,
                  decoration:
                      const InputDecoration(labelText: 'Remarks (Optional)')),
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
                    isSubmitting ? 'Submitting...' : 'Submit Inner Production'),
                style: FilledButton.styleFrom(
                    minimumSize: const Size(double.infinity, 64)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
