# Dashboard Screen Documentation

## 1. Overview
**Route**: `/`
**Purpose**: Provides a high-level operational snapshot of the factory factory. It is the landing page for all authenticated administrators.

## 2. UI Components

### 2.1 Stats Grid
A row of 4 KPI cards displaying real-time metrics (Currently placeholders):
- **Today's Production**: Items produced in the current shift.
- **Active Machines**: Number of machines currently running.
- **Pending Orders**: Count of open sales orders.
- **Low Stock Alerts**: Number of items below minimum threshold.

### 2.2 Production Overview Card
**Purpose**: Visual chart of production output over time.
**Current State**: Placeholder UI waiting for charting library integration.

### 2.3 Stock Summary Card
**Purpose**: Quick view of inventory distribution.
**Current State**: Placeholder UI.

### 2.4 Alerts Section
**Purpose**: System-wide notifications and warnings.
**Current State**: Placeholder "No alerts" message.

## 3. Data Sources
*Currently, this page uses static placeholder data (`const stats = [...]`).*
**Future Integration**: Will connect to a `GET /api/dashboard/stats` endpoint aggregating data from Production and Inventory services.

## 4. Key Files
- `apps/web/app/page.js`: Main page component.
- `apps/web/app/page.module.css`: Local styles for the dashboard grid.
