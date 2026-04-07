class Machine {
  final String id;
  final String name;
  final String type;
  final String status;
  final List<String> allowedTemplateIds;
  final Map<String, double> templateCycleTimes;
  final Map<String, int> templateCavityCounts;

  Machine({
    required this.id,
    required this.name,
    required this.type,
    required this.status,
    this.allowedTemplateIds = const [],
    this.templateCycleTimes = const {},
    this.templateCavityCounts = const {},
  });

  factory Machine.fromJson(Map<String, dynamic> json) {
    // Parse machine_products if it exists in the response
    final mpRaw = json['machine_products'] as List?;
    final allowedIds = <String>[];
    final cycleTimes = <String, double>{};
    final cavityCounts = <String, int>{};

    if (mpRaw != null) {
      for (var mp in mpRaw) {
        final templateId = mp['product_template_id'] as String?;
        if (templateId != null) {
          allowedIds.add(templateId);
          final cycleTime = (mp['ideal_cycle_time_seconds'] as num?)?.toDouble();
          if (cycleTime != null) {
            cycleTimes[templateId] = cycleTime;
          }
          final cavityCount = (mp['cavity_count'] as num?)?.toInt() ?? 1;
          cavityCounts[templateId] = cavityCount;
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
      templateCavityCounts: cavityCounts,
    );
  }
}
