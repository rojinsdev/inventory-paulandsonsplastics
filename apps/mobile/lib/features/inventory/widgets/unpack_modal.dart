import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/inventory_provider.dart';

class UnpackModal extends ConsumerStatefulWidget {
  final InventoryStock stock;

  const UnpackModal({
    super.key,
    required this.stock,
  });

  @override
  ConsumerState<UnpackModal> createState() => _UnpackModalState();
}

class _UnpackModalState extends ConsumerState<UnpackModal> {
  final _quantityController = TextEditingController();
  String _fromState = 'finished';
  String _toState = 'packed';
  bool _isProcessing = false;

  String get _unitLabel {
    final ut = widget.stock.unitType ?? 'bundle';
    final label = ut == 'bundle' ? 'bundle' : ut;
    return label[0].toUpperCase() + label.substring(1);
  }

  int get _availableStock =>
      _fromState == 'finished' ? widget.stock.bundledQty : widget.stock.packedQty;

  bool get _isQuantityInvalid {
    final qty = int.tryParse(_quantityController.text) ?? 0;
    return qty > _availableStock;
  }

  bool get _isQuantityZero {
    final qty = int.tryParse(_quantityController.text) ?? 0;
    return qty <= 0;
  }

  @override
  void dispose() {
    _quantityController.dispose();
    super.dispose();
  }

  Future<void> _handleUnpack() async {
    final qty = int.tryParse(_quantityController.text);
    if (qty == null || qty <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a valid quantity')),
      );
      return;
    }

    setState(() => _isProcessing = true);
    try {
      await ref.read(inventoryOperationProvider.notifier).unpack(
            widget.stock.productId ?? '',
            qty,
            _fromState,
            _toState,
            unitType: widget.stock.unitType ?? 'bundle',
            capId: widget.stock.capId,
          );

      if (mounted) {
        ref.invalidate(inventoryStockProvider);
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Unpacking successful')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: ${e.toString()}')),
        );
      }
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    // Calculate Yield based on product packing details
    final qty = int.tryParse(_quantityController.text) ?? 0;
    int multiplier = 0;
    if (_fromState == 'finished') {
      final unitType = widget.stock.unitType ?? 'bundle';
      if (_toState == 'packed') {
        if (unitType == 'bundle') {
          multiplier = widget.stock.packetsPerBundle ?? 50;
        } else if (unitType == 'bag') {
          multiplier = widget.stock.packetsPerBag ?? 0;
        } else if (unitType == 'box') {
          multiplier = widget.stock.packetsPerBox ?? 0;
        }
      } else {
        if (unitType == 'bundle') {
          multiplier = widget.stock.itemsPerBundle ?? 600;
        } else if (unitType == 'bag') {
          multiplier = widget.stock.itemsPerBag ?? 0;
        } else if (unitType == 'box') {
          multiplier = widget.stock.itemsPerBox ?? 0;
        }
      }
    } else {
      multiplier = widget.stock.itemsPerPacket ?? 12;
    }
    final yieldValue = qty * multiplier;

    return Container(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom + 32,
        top: 32,
        left: 24,
        right: 24,
      ),
      decoration: BoxDecoration(
        color: colorScheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(40)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: colorScheme.primaryContainer.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child:
                    Icon(Icons.unarchive_outlined, color: colorScheme.primary),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Unpack Items',
                      style: theme.textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Text(
                      widget.stock.displayName,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.close),
              ),
            ],
          ),
          const SizedBox(height: 32),

          // Selection
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Convert From',
                style: theme.textTheme.labelLarge
                    ?.copyWith(fontWeight: FontWeight.bold),
              ),
              Text(
                'Available: $_availableStock ${_fromState == 'finished' ? _unitLabel : 'Packet'}s',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: (_availableStock == 0)
                      ? colorScheme.error
                      : colorScheme.primary,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _SourceChip(
                label: _unitLabel,
                isSelected: _fromState == 'finished',
                onSelected: () => setState(() {
                  _fromState = 'finished';
                  _toState = 'packed';
                  _quantityController.clear();
                }),
              ),
              const SizedBox(width: 12),
              _SourceChip(
                label: 'Packet',
                isSelected: _fromState == 'packed',
                onSelected: () => setState(() {
                  _fromState = 'packed';
                  _toState = 'semi_finished';
                  _quantityController.clear();
                }),
              ),
            ],
          ),

          const SizedBox(height: 24),
          Text(
            'To',
            style: theme.textTheme.labelLarge
                ?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _toState,
            decoration: InputDecoration(
              filled: true,
              fillColor: colorScheme.surfaceContainerHighest.withValues(alpha: 0.1),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(20),
                borderSide: BorderSide.none,
              ),
            ),
            items: [
              if (_fromState == 'finished')
                const DropdownMenuItem(value: 'packed', child: Text('Packets')),
              if (_fromState == 'finished' || _fromState == 'packed')
                const DropdownMenuItem(
                    value: 'semi_finished', child: Text('Loose Items')),
            ],
            onChanged: (value) => setState(() => _toState = value!),
          ),

          const SizedBox(height: 24),
          Text(
            'Quantity to Unpack',
            style: theme.textTheme.labelLarge
                ?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _quantityController,
            keyboardType: TextInputType.number,
            autofocus: true,
            style: TextStyle(
              color: _isQuantityInvalid ? colorScheme.error : null,
            ),
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              hintText: 'Enter quantity...',
              filled: true,
              fillColor: colorScheme.surfaceContainerHighest.withValues(alpha: 0.1),
              errorText: _isQuantityInvalid ? 'Exceeds available stock' : null,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(20),
                borderSide: BorderSide.none,
              ),
              suffixText: _fromState == 'finished' ? _unitLabel : 'Packets',
            ),
          ),

          const SizedBox(height: 24),
          
          if (qty > 0)
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color:
                    colorScheme.primaryContainer.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Expected Yield:',
                    style: theme.textTheme.bodyMedium?.copyWith(
                        color: colorScheme.onPrimaryContainer),
                  ),
                  Text(
                    '$yieldValue ${_toState == 'packed' ? 'Packets' : 'Loose Items'}',
                    style: theme.textTheme.titleMedium?.copyWith(
                      color: colorScheme.primary,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),

          const SizedBox(height: 32),
          SizedBox(
            width: double.infinity,
            height: 64,
            child: ElevatedButton(
              onPressed:
                  (_isProcessing || _isQuantityInvalid || _isQuantityZero)
                      ? null
                      : _handleUnpack,
              style: ElevatedButton.styleFrom(
                backgroundColor: colorScheme.primary,
                foregroundColor: colorScheme.onPrimary,
                disabledBackgroundColor:
                    colorScheme.onSurface.withValues(alpha: 0.1),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(24),
                ),
                elevation: 0,
              ),
              child: _isProcessing
                  ? const CircularProgressIndicator(color: Colors.white)
                  : Text(
                      _isQuantityInvalid
                          ? 'Insufficient Stock'
                          : 'Confirm Unpack',
                      style: const TextStyle(
                          fontSize: 18, fontWeight: FontWeight.bold),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SourceChip extends StatelessWidget {
  final String label;
  final bool isSelected;
  final VoidCallback onSelected;

  const _SourceChip({
    required this.label,
    required this.isSelected,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Expanded(
      child: GestureDetector(
        onTap: onSelected,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 16),
          decoration: BoxDecoration(
            color: isSelected
                ? colorScheme.primary
                : colorScheme.surfaceContainerHighest.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(20),
            border: isSelected
                ? null
                : Border.all(color: colorScheme.outline.withValues(alpha: 0.1)),
          ),
          child: Center(
            child: Text(
              label,
              style: TextStyle(
                color:
                    isSelected ? colorScheme.onPrimary : colorScheme.onSurface,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
