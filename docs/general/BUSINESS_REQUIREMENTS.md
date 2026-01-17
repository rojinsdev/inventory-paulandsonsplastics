# Inventory & Production Management System - Business Requirements

---

# 👥 USER ROLES

## 🔑 Role 1: **Admin / Owner (Also Handles Sales)**

This role represents **one person or multiple people using the same access**.

### Admin / Owner CAN:

- Configure machines, products, dies
- Configure cycle time, product weight, packing rules
- Upload initial inventory
- View all inventory states
- Handle sales calls
- Create sales orders
- Reserve stock
- Confirm deliveries
- Manage customer profiles
- View reports & analytics

### Admin / Owner CANNOT:

- Edit historical production logs (audit safety)

---

## 🏭 Role 2: **Production Manager**

This role is **strictly operational**.

### Production Manager CAN:

- Enter daily production
- Move stock between:
    - Semi-finished → Packed
    - Packed → Finished

### Production Manager CANNOT:

- See sales orders
- See customer data
- Reserve stock
- See analytics or reports
- Edit machine/product settings

📌 This separation prevents **data misuse** and **confusion**.

---

# 1️⃣ SYSTEM GO-LIVE & INITIALIZATION

## 1.1 Opening Stock Setup (One-Time Only)

**Why this exists:**

The factory already has stock before software starts.

### Workflow

```
Admin logs in for the first time
   ↓
System detects "Initial Setup Pending"
   ↓
Admin enters:
- Raw material stock (kg)
- Semi-finished stock (product-wise)
- Packed stock (packet-wise)
- Finished goods (bundle/sack-wise)
   ↓
System saves as Opening Balance
   ↓
Initial Setup is locked permanently
```

📌 From this point onward, **stock can change ONLY via workflows**

---

# 2️⃣ MASTER DATA CONFIGURATION (ADMIN)

This defines the **rules of the factory**.

---

## 2.1 Machine Master

Each machine is created once.

### Fields per Machine

- Machine ID / Name
- Machine category (small / large)
- Max die weight supported (if applicable)
- Daily running cost (₹7,000–₹8,000)
- Active / inactive status

📌 Total machines = **8**

---

## 2.2 Product Master

Each physical item produced is defined here.

### Fields per Product

- Product name (e.g., Bottle)
- Size (100ml / 150ml / 200ml / 1L)
- Color (White / Black / Milky)
- Product weight (grams)
- Active / inactive

📌 Weight is **mandatory** for material deduction

---

## 2.3 Die / Machine–Product Mapping

This defines **what each machine can produce**.

### Workflow

```
Admin selects Machine
   ↓
Selects allowed Products
   ↓
For each mapping, defines:
- Cycle time (seconds per unit)
- Capacity restriction (if any)
```

📌 Same product can have **different cycle times on different machines**

---

## 2.4 Packing Rules

Packing logic is centralized.

### Configurable Values

- Items per packet (e.g., 12)
- Packets per bundle/sack (e.g., 50–60)

📌 These rules affect **inventory math only**, not production

---

# 3️⃣ DAILY PRODUCTION WORKFLOW (PRODUCTION MANAGER)

---

## 3.1 Shift Runtime Rule (System-Enforced)

- Total day = **24 hours**
- Effective runtime = **23 hours**
- 1 hour auto-reserved for:
    - Die changes
    - Maintenance
    - Cleaning

📌 No user input allowed here

---

## 3.2 Production Entry (Mobile App)

### Step-by-step

```
Production Manager opens app
   ↓
Selects Date (default = today)
   ↓
Selects Machine ID
   ↓
Selects Product (Size + Color)
   ↓
Enters Actual Quantity Produced
   ↓
Submits
```

### Validation Rules

- Product must be compatible with selected machine
- Quantity must be a positive number

---

## 3.3 Automatic Backend Logic (Critical)

When production is saved:

### A. Production Calculations

```
Theoretical Output =
(23 × 60 × 60) ÷ Cycle Time
```

```
Efficiency % =
Actual ÷ Theoretical × 100
```

### B. Cost Recovery Check

```
Is production sufficient to justify ₹7k–₹8k?
→ YES / NO
```

### C. Inventory Update

```
Actual Quantity → Semi-Finished Stock
```

### D. Raw Material Deduction

```
Actual Quantity × Product Weight
   ↓
Deduct from Raw Material Stock
```

### E. Wastage Logging

- Extra plastic trimming recorded as wastage (non-sellable)

📌 Production Manager **never sees these calculations**

---

# 4️⃣ INVENTORY STATE MANAGEMENT

Inventory always exists in **one and only one state**.

---

## 4.1 Semi-Finished Goods

- Created automatically from production
- Not sellable
- Product, size, and color preserved

---

## 4.2 Packing Workflow

```
Production Manager packs items
   ↓
Updates quantity to pack
   ↓
System converts:
Items → Packets
   ↓
Semi-Finished reduces
Packed increases
```

📌 Partial packing allowed

---

## 4.3 Bundling Workflow

```
Packed packets grouped
   ↓
Packets → Bundles / Sacks
   ↓
Status changes to Finished Goods
```

📌 Only Finished Goods are sellable

---

# 5️⃣ SALES & CUSTOMER WORKFLOW (ADMIN ONLY)

---

## 5.1 Customer Master

Only **important customers** are stored.

### Customer Types

- Permanent (monthly buyers)
- Seasonal / Bulk (churches, temples, festivals)

### Stored Fields

- Customer name
- Contact details
- Notes (optional)

❌ One-time customers are not saved

---

## 5.2 Sales Call Flow

```
Admin receives customer call
   ↓
Searches customer by name
   ↓
Views:
- Last order
- Typical products
- Typical quantities
   ↓
Checks Live Stock
   ↓
Confirms order verbally
```

---

## 5.3 Sales Order Creation

```
Admin creates Sales Order
   ↓
Selects products & quantities
   ↓
System checks availability
   ↓
Finished Goods → Reserved
```

📌 Reserved stock is blocked, not deducted

---

## 5.4 Delivery Confirmation

```
Order delivered physically
   ↓
Admin marks order as Delivered
   ↓
Reserved stock deducted permanently
```

📌 Only at this point inventory reduces

---

# 6️⃣ LIVE STOCK LOGIC (SYSTEM RULE)

```
Available Stock =
Finished Goods − Reserved Stock
```

- Semi-finished → excluded
- Packed → excluded

📌 Always real-time

---

# 7️⃣ ADMIN DASHBOARD (OWNER VIEW)

Admin sees **decision-level information**:

- Machine-wise efficiency
- Underperforming machines
- Daily cost recovery status
- Stock by state
- Raw material balance
- Customer buying patterns

📌 No manual calculations needed

---

# 8️⃣ REPORTING & FORECASTING

### Data Accumulation

- Daily production
- Monthly aggregation
- Yearly comparison

### Used for:

- Festival planning
- Seasonal bulk orders
- Raw material purchase planning

📌 No AI

📌 Pure historical intelligence

---

# 9️⃣ HARD BOUNDARIES (FINAL)

```
❌ Billing
❌ GST
❌ Tally
```

System handles ONLY:

```
Production + Inventory + Sales Support + Customer Memory
```

---

# 🔧 TECHNICAL IMPLEMENTATION NOTES

## Database Schema Additions Needed

1. **Opening Stock Table**
   - One-time initialization flag
   - Product-wise opening balances per state
   - Raw material opening balance
   - Created timestamp (locked after first entry)

2. **Machine Status Field**
   - Changed from `active/maintenance/retired` to `active/inactive`

3. **Customer Type Field**
   - `permanent` | `seasonal` | `other`

## API Endpoints to Add

1. **Opening Stock Setup**
   - `POST /api/setup/opening-stock` (one-time only)
   - `GET /api/setup/status` (check if initial setup done)

2. **Role-Based Access**
   - All endpoints need role validation
   - Production Manager blocked from sales/customer/analytics endpoints

## UI Changes Needed

1. **First-Time Setup Wizard**
   - Multi-step form for opening stock
   - Locked after completion

2. **Role-Based Navigation**
   - Admin sees everything
   - Production Manager sees limited menu

3. **Available Stock Calculation**
   - Display: Finished - Reserved
   - Not: Total of all states
