import 'dart:convert';

class User {
  final String id;
  final String email;
  final String role;
  final String fullName;

  User({
    required this.id,
    required this.email,
    required this.role,
    required this.fullName,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    final id = json['id'] as String?;
    final email = json['email'] as String?;
    final role = json['role'] as String?;
    final fullName = json['full_name'] as String? ??
        json['fullName'] as String? ??
        email ??
        'User';

    if (id == null) {
      throw Exception('User data missing: id is required');
    }
    if (email == null) {
      throw Exception('User data missing: email is required');
    }
    if (role == null) {
      throw Exception('User data missing: role is required');
    }

    return User(
      id: id,
      email: email,
      role: role,
      fullName: fullName,
    );
  }

  Map<String, dynamic> toJson() {
    return {'id': id, 'email': email, 'role': role, 'full_name': fullName};
  }

  /// Serialize to JSON string for storage
  String toJsonString() {
    return jsonEncode(toJson());
  }

  /// Deserialize from JSON string
  factory User.fromJsonString(String jsonString) {
    return User.fromJson(jsonDecode(jsonString) as Map<String, dynamic>);
  }
}
