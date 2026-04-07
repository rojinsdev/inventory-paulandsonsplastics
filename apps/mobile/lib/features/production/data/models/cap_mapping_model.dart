class CapMapping {
  final String id;
  final String machineId;
  final String capTemplateId;
  final double idealCycleTimeSeconds;
  final int cavityCount;
  final String? machineName;
  final String? capTemplateName;

  CapMapping({
    required this.id,
    required this.machineId,
    required this.capTemplateId,
    required this.idealCycleTimeSeconds,
    this.cavityCount = 1,
    this.machineName,
    this.capTemplateName,
  });

  factory CapMapping.fromJson(Map<String, dynamic> json) {
    return CapMapping(
      id: json['id'] as String,
      machineId: json['machine_id'] as String,
      capTemplateId: json['cap_template_id'] as String,
      idealCycleTimeSeconds: (json['ideal_cycle_time_seconds'] as num).toDouble(),
      cavityCount: json['cavity_count'] as int? ?? 1,
      machineName: json['machines'] != null ? json['machines']['name'] as String? : null,
      capTemplateName: json['cap_templates'] != null ? json['cap_templates']['name'] as String? : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'machine_id': machineId,
      'cap_template_id': capTemplateId,
      'ideal_cycle_time_seconds': idealCycleTimeSeconds,
      'cavity_count': cavityCount,
    };
  }
}
