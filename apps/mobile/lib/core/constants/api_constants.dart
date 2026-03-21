class ApiConstants {
  // Use 10.0.2.2 for Android Emulator to access localhost of the host machine
  // Use local IP (e.g., 192.168.x.x) for physical device
  // Currently using Ethernet 5 (likely USB Tethering): http://10.211.125.158:4000/api
  static const String baseUrl = 'http://10.211.125.158:4000/api';

  static const String loginEndpoint = '/auth/login';
  static const String meEndpoint = '/auth/me';

  static const String productionSubmit = '/production/submit';
  static const String capProductionSubmit = '/production/caps/submit';
  static const String lastSession = '/production/last-session';
  static const String productionDaily = '/production/daily';
  static const String productionRequests = '/production/requests';

  static const String machines = '/machines';
  static const String products = '/products';
  static const String productTemplates = '/products/templates';
  static const String caps = '/caps';
  static const String capTemplates = '/caps/templates';

  static const String inventoryPack = '/inventory/pack';
  static const String inventoryBundle = '/inventory/bundle';
  static const String inventoryUnpack = '/inventory/unpack';
  static const String inventoryStock = '/inventory/stock';

  static const String inventoryStockOverview = '/inventory/overview';
  static const String inventoryRawMaterials = '/inventory/raw-materials';
  static const String inventoryCapBalances = '/caps/balances';
  static const String salesOrders = '/orders';
  static const String notificationsTokens = '/notifications/tokens';
}
