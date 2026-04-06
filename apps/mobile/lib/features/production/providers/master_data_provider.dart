import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../features/auth/providers/auth_provider.dart';
import '../data/master_data_repository.dart';
import '../data/models/machine_model.dart';
import '../data/models/product_model.dart';
import '../data/models/product_template_model.dart';
import '../data/models/cap_model.dart';
import '../data/models/cap_template_model.dart';

import '../data/models/inner_model.dart';
import '../data/models/inner_template_model.dart';
import '../data/models/cap_mapping_model.dart';

final masterDataRepositoryProvider = Provider<MasterDataRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return MasterDataRepository(apiClient);
});

final capMappingsProvider =
    FutureProvider.autoDispose<List<CapMapping>>((ref) async {
  final repo = ref.watch(masterDataRepositoryProvider);
  return repo.getCapMappings();
});

final machinesProvider = FutureProvider.autoDispose<List<Machine>>((ref) async {
  final repo = ref.watch(masterDataRepositoryProvider);
  return repo.getMachines();
});

final productsProvider = FutureProvider.autoDispose<List<Product>>((ref) async {
  final repo = ref.watch(masterDataRepositoryProvider);
  return repo.getProducts();
});

final productTemplatesProvider =
    FutureProvider.autoDispose<List<ProductTemplate>>((ref) async {
  final repo = ref.watch(masterDataRepositoryProvider);
  return repo.getProductTemplates();
});

final capsProvider = FutureProvider.autoDispose<List<Cap>>((ref) async {
  final repo = ref.watch(masterDataRepositoryProvider);
  return repo.getCaps();
});

final capTemplatesProvider =
    FutureProvider.autoDispose<List<CapTemplate>>((ref) async {
  final repo = ref.watch(masterDataRepositoryProvider);
  return repo.getCapTemplates();
});

final innersProvider = FutureProvider.autoDispose<List<Inner>>((ref) async {
  final repo = ref.watch(masterDataRepositoryProvider);
  return repo.getInners();
});

final innerTemplatesProvider =
    FutureProvider.autoDispose<List<InnerTemplate>>((ref) async {
  final repo = ref.watch(masterDataRepositoryProvider);
  return repo.getInnerTemplates();
});
