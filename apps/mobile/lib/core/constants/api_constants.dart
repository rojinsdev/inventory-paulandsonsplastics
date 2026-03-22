class ApiConstants {
  // Production AWS EC2 Instance (Verified Domain with SSL)
  static const String baseUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'https://api.paulandsonsplastics.com/api',
  );

  static const String loginEndpoint = '/auth/login';
  static const String meEndpoint = '/auth/me';

  static const String productionSubmit = '/production/submit';
  static const String capProductionSubmit = '/production/caps/submit';
  static const String innerProductionSubmit = '/production/inners/submit';
  static const String lastSession = '/production/last-session';
  static const String productionDaily = '/production/daily';
  static const String productionRequests = '/production/requests';

  static const String machines = '/machines';
  static const String products = '/products';
  static const String productTemplates = '/products/templates';
  static const String caps = '/caps';
  static const String capTemplates = '/caps/templates';
  static const String inners = '/inners';
  static const String innerTemplates = '/inners/templates';

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
