class ApiConstants {
  // Use 10.0.2.2 for Android Emulator to access localhost of the host machine
  // Use local IP (e.g., 192.168.x.x) for physical device
  static const String baseUrl = 'http://10.0.2.2:4000/api';

  static const String loginEndpoint = '/auth/login';
  static const String meEndpoint = '/auth/me';

  static const String productionSubmit = '/production/submit';
  static const String capProductionSubmit = '/production/caps/submit';
  static const String lastSession = '/production/last-session';
  static const String productionDaily = '/production/daily';
  static const String productionRequests = '/production/requests';

  static const String machines = '/machines';
  static const String products = '/products';
  static const String caps = '/caps';

  static const String inventoryPack = '/inventory/pack';
  static const String inventoryBundle = '/inventory/bundle';
  static const String inventoryStock = '/inventory/stock';
  static const String inventoryStockOverview = '/inventory/overview';
  static const String inventoryRawMaterials = '/inventory/raw-materials';
  static const String salesOrders = '/orders';
}
