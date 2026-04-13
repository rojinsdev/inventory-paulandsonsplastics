/** Tab names in the target spreadsheet (create these sheets and header row 1 before enabling sync). */
export const GOOGLE_SHEET_TABS = {
    Sales_orders: 'Sales_orders',
    Sales_dispatch_lines: 'Sales_dispatch_lines',
    Customer_payments: 'Customer_payments',
    Customers_snapshot: 'Customers_snapshot',
    Purchases: 'Purchases',
    Suppliers_snapshot: 'Suppliers_snapshot',
    Cash_flow: 'Cash_flow',
} as const;
