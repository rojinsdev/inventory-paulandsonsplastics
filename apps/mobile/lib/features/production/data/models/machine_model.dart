class Machine {
  final String id;
  final String name;
  final String type;
  final String status;
  final List<String> allowedTemplateIds;
  final Map<String, double> templateCycleTimes;

  Machine({
    required this.id,
    required this.name,
    required this.type,
    required this.status,
    this.allowedTemplateIds = const [],
    this.templateCycleTimes = const {},
  });

  factory Machine.fromJson(Map<String, dynamic> json) {
    // Parse machine_products if it exists in the response
    final mpRaw = json['machine_products'] as List?;
    final allowedIds = <String>[];
    final cycleTimes = <String, double>{};

    if (mpRaw != null) {
      for (var mp in mpRaw) {
        final templateId = mp['product_template_id'] as String?;
        if (templateId != null) {
          allowedIds.add(templateId);
          final cycleTime = (mp['ideal_cycle_time_seconds'] as num?)?.toDouble();
          if (cycleTime != null) {
            cycleTimes[templateId] = cycleTime;
          }
        }
      }
    }

    return Machine(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'Unknown',
      type: json['type'] as String? ?? '',
      status: json['status'] as String? ?? 'offline',
      allowedTemplateIds: allowedIds,
      templateCycleTimes: cycleTimes,
    );
  }
}
