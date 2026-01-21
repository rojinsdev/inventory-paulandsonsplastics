# Sales Screens Documentation

## 1. Overview
The Sales module manages the customer relationship and order fullfillment process.

## 2. Customer Management
**Route**: `/customers`
**Purpose**: Maintain a database of clients.
**Features**:
- List view of all customers.
- "Add Customer" form (Name, Contact, Address).
- Edit/Delete functionality.
- Search/Filter by name.
**API**: `POST /api/customers`, `GET /api/customers`.

## 3. Sales Orders
**Route**: `/orders`
**Purpose**: Create and track orders.
**Workflow**:
1.  **Draft**: Order created, items added.
2.  **Confirmed**: Stock reserved (moves to `reserved` state).
3.  **Dispatched**: Items delivered to customer.
**Features**:
- Order creation wizard.
- Selecting products and quantities.
- Auto-calculation of total value.
**API**: `POST /api/orders`, `PUT /api/orders/:id/status`.

## 4. Deliveries
**Route**: `/deliveries`
**Purpose**: Manage dispatch logistics.
**Features**:
- View orders ready for dispatch.
- Generate delivery challans/invoices.
- Mark orders as 'Delivered'.

## 5. Live Stock
**Route**: `/inventory/live` (Accessed via Sales sidebar)
**Purpose**: Real-time view of sellable inventory.
**Difference from Inventory**: Focuses only on `finished` goods available for immediate sale, hiding WIP (Work In Progress).
