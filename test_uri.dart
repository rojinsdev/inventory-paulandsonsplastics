void main() {
  final base = Uri.parse('http://localhost:4000/api');
  print('Base: $base');
  print('/orders: ${base.resolve('/orders')}');
  print('orders: ${base.resolve('orders')}');

  final baseTrailing = Uri.parse('http://localhost:4000/api/');
  print('Base Trailing: $baseTrailing');
  print('/orders: ${baseTrailing.resolve('/orders')}');
  print('orders: ${baseTrailing.resolve('orders')}');
}
