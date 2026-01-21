# Configuration Screens Documentation

## 1. Overview
The Configuration section handles the master data that drives the production and sales logic. These settings are rarely changed but critical for system accuracy.

## 2. Machine Master
**Route**: `/machines`
**Purpose**: Register factory machinery.
**Fields**:
- **Name/ID**: Unique identifier.
- **Hourly Rate**: Cost per hour (for profitability reports).
- **Status**: Active/Maintenance.
**API**: `GET/POST /api/machines`.

## 3. Product Master
**Route**: `/products`
**Purpose**: Define the catalog of manufacturable items.
**Fields**:
- **Name**: e.g., "Garbage Bag".
- **Size**: e.g., "24x30".
- **Color**: e.g., "Black".
- **Selling Price**: Base price per unit/bundle.
- **Attributes**: Thickness (micron), weight per piece.
**API**: `GET/POST /api/products`.

## 4. Die Mappings
**Route**: `/die-mappings`
**Purpose**: Define compatibility between Machines and Products/Dies.
**Logic**: Ensures that production plans only assign products to machines capable of producing them.
**Features**: Matrix view or list of Machine-Product pairs.

## 5. Packing Rules
**Route**: `/packing-rules`
**Purpose**: Define how products are packaged.
**Logic**:
- **Items per Packet**: e.g., 100 pieces -> 1 Packet.
- **Packets per Bundle**: e.g., 50 Packets -> 1 Bundle.
**Impact**: Used by the Inventory system to convert "Loose Items" to "Finished Goods".
