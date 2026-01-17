import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../features/auth/providers/auth_provider.dart';
import '../data/master_data_repository.dart';
import '../data/models/machine_model.dart';
import '../data/models/product_model.dart';

final masterDataRepositoryProvider = Provider<MasterDataRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return MasterDataRepository(apiClient);
});

final machinesProvider = FutureProvider<List<Machine>>((ref) async {
  final repo = ref.watch(masterDataRepositoryProvider);
  return repo.getMachines();
});

final productsProvider = FutureProvider<List<Product>>((ref) async {
  final repo = ref.watch(masterDataRepositoryProvider);
  return repo.getProducts();
});
