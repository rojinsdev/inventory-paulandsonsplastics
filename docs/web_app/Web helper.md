Web Admin Portal - Complete Screens Walkthrough
✅ All Core Screens Built and Functional
Phase 1: Dashboard & Navigation
Dashboard Home (/dashboard)

Real-time production stats (total output, machines active, avg efficiency)
Inventory snapshot by state (semi-finished, packed, finished, reserved)
Data fetched from production and inventory APIs
Auto-refreshes on load
App Layout

Fixed sidebar navigation with grouped menus
Top header with user email, role badge, and logout
Protected routes - redirects to login if unauthenticated
Responsive layout (sidebar + main content area)
Phase 2: Configuration Screens
Machines Management
Machines List (/config/machines)

Table view with all machines
Columns: Name, Type, Category, Status, Daily Cost
Edit and Delete actions per row
"Add Machine" button
Create Machine (/config/machines/new)

Form with fields: Name, Type, Category, Max Die Weight, Daily Cost, Status
Dropdown selects for type (extruder, cutting, printing, packing) and category
POST to /api/machines
Edit Machine (/config/machines/[id])

Pre-populated form with existing machine data
PUT to /api/machines/:id
Cancel button returns to list
Products Management
Products List (/config/products)

Table with: Name, Size, Color, Weight, Price, Packing (items/packets)
Edit/Delete actions
"Add Product" button
Create Product (/config/products/new)

Form: Name, Size, Color, Weight, SKU, Selling Price
Packing configuration section (Items per Packet, Packets per Bundle)
POST to /api/products
Edit Product (/config/products/[id])

Editable form with all product fields
PUT to /api/products/:id
Die Configuration (/config/die-mapping)
Table showing machine-product mappings
Columns: Machine, Product, Size, Color, Cycle Time
Inline form to add new mapping (machine + product + cycle time)
Delete mapping action
POST to /api/machine-products
Settings (/config/settings)
Category tabs: Production, Inventory, Sales, Auth
Editable fields per setting (text, number, boolean dropdowns)
Shows display name and description
"Save Changes" button (only appears when values edited)
PATCH to /api/settings/:key
Phase 3: Sales & Customers
Customers Management
Customers List (/sales/customers)

Table: Name, Phone, Type (badge), Notes preview
Edit/Delete actions
"Add Customer" button
Create Customer (/sales/customers/new)

Form: Name, Phone, Type (permanent/seasonal/other), Notes textarea
POST to /api/customers
Edit Customer (/sales/customers/[id])

Pre-populated form
PUT to /api/customers/:id
Sales Orders
Orders List (/sales/orders)

Table: Order ID, Customer name, Date, Status
Status dropdown per row (reserved → delivered/cancelled)
Inline status update with color-coded badges
"New Order" button
PATCH to /api/sales-orders/:id/status
Create Order (/sales/orders/new)

Dropdown to select customer (fetched from API)
Dropdown to select product (fetched from API)
Quantity input (bundles)
Notes textarea
POST to /api/sales-orders
Phase 4: Inventory
Stock View (/inventory/stock)

Tabs to filter by state: All, Semi-Finished, Packed, Finished, Reserved
Table: Product, Size, Color, State (badge), Quantity
Color-coded state badges (finished = green, reserved = blue, etc.)
GET from /api/inventory/stock
Phase 5: Analytics (/analytics)
Placeholder page ("coming soon")
Reserved for future production reports and insights
🔗 API Integration Summary
All screens connect to backend APIs with proper authentication:

Screen	API Endpoint	Method
Dashboard stats	/api/production, /api/inventory/stock	GET
Machines list	/api/machines	GET
Create machine	/api/machines	POST
Edit machine	/api/machines/:id	PUT
Delete machine	/api/machines/:id	DELETE
Products list	/api/products	GET
Create product	/api/products	POST
Edit product	/api/products/:id	PUT
Delete product	/api/products/:id	DELETE
Customers list	/api/customers	GET
Create customer	/api/customers	POST
Edit customer	/api/customers/:id	PUT
Delete customer	/api/customers/:id	DELETE
Orders list	/api/sales-orders	GET
Create order	/api/sales-orders	POST
Update order status	/api/sales-orders/:id/status	PATCH
Die mappings	/api/machine-products	GET, POST, DELETE
Settings	/api/settings, /api/settings/:key	GET, PATCH
Stock view	/api/inventory/stock	GET
🎨 UI Consistency
All screens follow the design system:

✅ Slate color palette (calm, professional)
✅ Inter font throughout
✅ Consistent table layouts
✅ White cards with subtle borders
✅ Color-coded status badges
✅ Uniform button styles (primary, secondary, danger)
✅ Clean form layouts with labeled inputs
🔐 Security
All API calls include Authorization: Bearer ${token} header
Token stored in localStorage
Protected routes redirect to /login if not authenticated
User email and role displayed in header
📊 Features Summary
✅ Complete:

Full CRUD for Machines, Products, Customers
Sales Orders with status management
Dashboard with real production/inventory data
Die Configuration (machine-product mapping)
Settings management (editable by category)
Inventory stock view (filterable by state)
Protected authentication flow
⏳ Future:

Analytics/Reports page
Stock movements log
Order details page
Advanced search/filters