# Reports Screens Documentation

## 1. Overview
The Reports section allows admins to analyze historical data and trends.

## 2. Production Reports
**Route**: `/reports/production`
**Purpose**: Analyze manufacturing output and efficiency.
**Metrics**:
- **Total Output**: Kg/Units produced per shift/day.
- **Machine Utilization**: % of time machines were active.
- **Waste Analysis**: Scrap vs Good production.

## 3. Inventory Reports
**Route**: `/reports/inventory`
**Purpose**: Monitor stock levels and movement history.
**Features**:
- **Stock Movement Log**: Detailed history of all ins and outs (`inventory_transactions`).
- **Low Stock Report**: List of items below reorder point.
- **Valuation Report**: Total value of current stock (Quantity * Cost).

## 4. Sales Reports
**Route**: `/reports/sales`
**Purpose**: Track revenue and order performance.
**Metrics**:
- **Revenue**: Daily/Monthly sales totals.
- **Top Products**: Best-selling items.
- **Customer Analysis**: Orders per customer.
