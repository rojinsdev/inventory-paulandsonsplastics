class Machine {
  final String id;
  final String name;
  final String type;
  final String status;

  Machine({
    required this.id,
    required this.name,
    required this.type,
    required this.status,
  });

  factory Machine.fromJson(Map<String, dynamic> json) {
    return Machine(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'Unknown',
      type: json['type'] as String? ?? '',
      status: json['status'] as String? ?? 'offline',
    );
  }
}
