import 'package:flutter/material.dart';

class MultiSelectDowntimeReason extends StatefulWidget {
  final List<String> initialValues;
  final Function(List<String>) onSelectionChanged;
  final String? labelText;
  final String? helperText;
  final TextStyle? helperStyle;
  final IconData? prefixIcon;

  const MultiSelectDowntimeReason({
    super.key,
    required this.initialValues,
    required this.onSelectionChanged,
    this.labelText,
    this.helperText,
    this.helperStyle,
    this.prefixIcon,
  });

  @override
  State<MultiSelectDowntimeReason> createState() => _MultiSelectDowntimeReasonState();
}

class _MultiSelectDowntimeReasonState extends State<MultiSelectDowntimeReason> {
  late List<String> _selectedItems;
  final List<String> _allReasons = [
    'Die Change',
    'Power Cut',
    'Machine Issue',
    'Material Shortage',
    'Operator Shift Change',
    'Maintenance',
    'Other',
  ];

  @override
  void initState() {
    super.initState();
    _selectedItems = List.from(widget.initialValues);
  }

  void _showMultiSelect() async {
    final List<String>? results = await showDialog(
      context: context,
      builder: (BuildContext context) {
        return MultiSelectDialog(
          items: _allReasons,
          initialSelectedItems: _selectedItems,
        );
      },
    );

    if (results != null) {
      setState(() {
        _selectedItems = results;
      });
      widget.onSelectionChanged(_selectedItems);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    
    return InkWell(
      onTap: _showMultiSelect,
      borderRadius: BorderRadius.circular(12),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: widget.labelText,
          helperText: widget.helperText,
          helperStyle: widget.helperStyle,
          prefixIcon: Icon(widget.prefixIcon ?? Icons.report_problem_outlined),
          suffixIcon: const Icon(Icons.arrow_drop_down),
        ),
        child: _selectedItems.isEmpty
            ? Text(
                'Select reason(s)',
                style: TextStyle(color: theme.colorScheme.onSurfaceVariant.withOpacity(0.6)),
              )
            : Wrap(
                spacing: 8.0,
                runSpacing: -8.0,
                children: _selectedItems
                    .map((item) => Chip(
                          labelPadding: const EdgeInsets.symmetric(horizontal: 4),
                          label: Text(
                            item,
                            style: const TextStyle(fontSize: 12),
                          ),
                          onDeleted: () {
                            setState(() {
                              _selectedItems.remove(item);
                            });
                            widget.onSelectionChanged(_selectedItems);
                          },
                        ))
                    .toList(),
              ),
      ),
    );
  }
}

class MultiSelectDialog extends StatefulWidget {
  final List<String> items;
  final List<String> initialSelectedItems;

  const MultiSelectDialog({
    super.key,
    required this.items,
    required this.initialSelectedItems,
  });

  @override
  State<StatefulWidget> createState() => _MultiSelectDialogState();
}

class _MultiSelectDialogState extends State<MultiSelectDialog> {
  final List<String> _selectedItems = [];

  @override
  void initState() {
    super.initState();
    _selectedItems.addAll(widget.initialSelectedItems);
  }

  void _itemChange(String itemValue, bool isSelected) {
    setState(() {
      if (isSelected) {
        _selectedItems.add(itemValue);
      } else {
        _selectedItems.remove(itemValue);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Select Downtime Reasons'),
      content: SingleChildScrollView(
        child: ListBody(
          children: widget.items
              .map((item) => CheckboxListTile(
                    value: _selectedItems.contains(item),
                    title: Text(item),
                    controlAffinity: ListTileControlAffinity.leading,
                    onChanged: (isChecked) => _itemChange(item, isChecked!),
                  ))
              .toList(),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: () => Navigator.pop(context, _selectedItems),
          child: const Text('Done'),
        ),
      ],
    );
  }
}
