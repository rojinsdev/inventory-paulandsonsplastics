## Inventory & Production Management System

---

## 1. Executive Summary

This proposal outlines the development of a **custom Inventory and Production Management System** designed specifically for your factory operations.

The system will provide complete visibility into:

- Machine-wise production performance
- Daily production efficiency and cost justification
- Accurate inventory tracking from production to delivery
- Real-time stock availability for sales confirmation
- Historical data for future production planning

The solution will focus **only on internal production and inventory management** and will not replace or interfere with existing billing, GST, or Tally systems.

---

## 2. Understanding of Current Challenges

Based on discussions and the operational workflow shared, the following challenges are currently present:

- Difficulty in comparing **machine capacity vs actual daily production**
- No clear way to know if **machine running cost (₹7,000–₹8,000 per day)** is being recovered
- Manual tracking of inventory leading to confusion between:
    - Semi-finished stock
    - Finished goods
    - Sold or reserved stock
- Risk of **double-selling stock**
- Sales team depends on manual confirmation for stock availability
- No structured historical data for **seasonal demand forecasting**

---

## 3. Proposed Solution Overview

We propose a **centralized digital system** consisting of:

- **Web-based Admin Portal** – for management, sales, configuration, and analytics
- **Mobile Application** – for factory managers and staff to enter daily production data
- **Central Backend System** – for inventory logic, calculations, and data storage

This system will act as a **single source of truth** for production and inventory across the organization.

---

## 4. System Modules & Features

---

### 4.1 Production & Machine Management

The system will track **8 individual machines**, each capable of producing multiple products using different dies/molds.

For each machine and product:

- Cycle time (seconds per unit) will be configured
- Daily running cost will be defined

The system will automatically calculate:

- **Theoretical Maximum Production**
    
    (Total available running time ÷ Cycle time)
    
- **Actual Production** (entered daily)
- **Efficiency Percentage**
- **Daily cost recovery indicator**
    
    (Whether the machine output justifies the running cost)
    

📌 **Outcome:**

Management can clearly see which machines are performing efficiently and which require attention.

---

### 4.2 Daily Production Entry (Mobile App)

Factory managers/staff will use a **simple mobile application** to enter daily production.

Daily workflow:

1. Select machine
2. Select product (size, color, variant)
3. Enter production quantity
4. Submit

The app is designed to be:

- Easy to use
- Fast and reliable
- Suitable for real factory environments

📌 **Outcome:**

Accurate and consistent daily production data with minimal effort.

---

### 4.3 Inventory Management Workflow

Inventory will be tracked using a **state-based workflow**:

1. **Semi-Finished Stock**
    - Direct output from machines
2. **Packed Stock**
    - Products packed into packets
3. **Finished Goods**
    - Packets grouped into bundles or sacks
    - Ready for sale
4. **Reserved Stock**
    - Stock blocked when a sales order is placed
    - Prevents double-selling
5. **Delivered**
    - Stock deducted only after delivery confirmation

📌 **Outcome:**

Clear and accurate inventory status at all times.

---

### 4.4 Sales & Live Stock View

Admin, Owner, and Sales users will have access to:

- Real-time available stock
- Automatically adjusted stock excluding reserved quantities
- Product-wise and variant-wise availability

This allows the sales team to:

- Confirm orders instantly during client calls
- Avoid over-commitment

📌 **Outcome:**

Faster order confirmation and increased customer trust.

---

### 4.5 Reports & Analytics

The system will store all production and inventory data to generate:

- Daily and monthly production reports
- Machine-wise efficiency trends
- Product-wise stock reports
- Historical data for:
    - Seasonal demand analysis
    - Future production planning

📌 **Outcome:**

Data-driven decisions instead of manual estimates.

---

## 5. User Access & Roles

The system will use a **simple access model**:

| User Type | Access |
| --- | --- |
| **Admin / Owner / Sales** | Full access: live stock, reservations, reports, analytics, configuration |
| **Factory Manager / Staff** | Production entry and inventory movement |

📌 Admin, Owner, and Sales teams will share the **same access level** to ensure fast decision-making without permission delays.

---

## 6. Scope Clarification (Out of Scope)

The following are **not included** in this system:

- Billing and invoicing
- GST calculation
- Tally integration

These functions will continue to be handled separately to keep the system focused and efficient.

---

## 7. Technology Overview

The system will be built using modern, scalable, and cost-effective technologies:

- **Backend**: Application Server (Node.js)
- **Database**: Supabase (PostgreSQL)
- **Web Portal**: Modern web application (Next.js)
- **Mobile App**: Cross-platform mobile application (Flutter)

This ensures:

- Low operational cost
- High scalability
- Secure and reliable performance

---

## 8. Development Phases

### Phase 1 – Core Production & Inventory

- Machine configuration
- Production data entry
- Finished goods tracking

### Phase 2 – Sales & Reservation

- Reserved stock logic
- Live stock view for sales

### Phase 3 – Analytics & Planning

- Reports and dashboards
- Historical data insights
- Seasonal planning support

---

## 9. Key Business Benefits

- Clear visibility into **daily machine profitability**
- Reduced inventory errors and losses
- Faster sales confirmation
- Better production planning
- Scalable system for future growth

---

## 10. Conclusion

This solution is designed specifically for your factory workflow, not as a generic inventory tool. It will improve operational efficiency, provide financial clarity on production performance, and support informed business decisions

---

# Summary

### **1. Production & Machinery Configuration**

- **Initial Inventory Setup:** The system must start with a bulk upload of all existing inventory up to the date the software goes live.
- **Machine Tracking:** The system must manage eight distinct machinery units.
- **Die (Mold) Management:** Machines produce different items (e.g., 100ml vs. 200ml ) by swapping "dies".
- **Variable Capacity:** Some small machines have a maximum capacity of 100ml or 150ml based on the weight of the die.
- **Cycle Time:** Each product has a specific "cycle time" (e.g., one unit every 13 seconds).
- **Product Weight:** Each product must be linked to its specific weight in grams for material tracking.
- **Admin Configuration:** Admins must be able to manually configure and update cycle times and weights through a settings screen.

### **2. Daily Factory Workflow (Mobile App)**

- **Shift Runtime:** Efficiency calculations are based on a 24-hour cycle, but the software must account for 23 hours of actual runtime, allowing 1 hour for die changes and maintenance.
- **Entry Process:** The manager selects the Machine ID, the Product Category, and the Color (White, Black, or Milky).
- **Manual Entry:** The manager manually enters the actual count produced during the shift.
- **Efficiency Analysis:** The system must automatically compare the actual count against the theoretical maximum (Total Seconds / Cycle Time).
- **Machine Costing:** The system monitors if production meets the daily running cost of the machine (approx. 7,000–8,000 Rupees).

### **3. Inventory States & Packing**

- **Semi-Finished Goods:** Products are initially logged here after production.
- **Packing Logic:** The system must track items as they are packed into packets (e.g., 12 items per packet).
- **Bundling:** Packets are then grouped into large bundles or sacks (e.g., 50–60 packets per bundle).
- **Finished Goods:** Once bundled, the status updates to "Finished Goods".
- **Material Deduction:** As products are made, the system should deduct the equivalent weight from the raw material stock, accounting for the "extra" plastic trimmed during the finishing process.

### **4. Sales & Client Management**

- **Live Stock View:** Sales staff need a real-time view of inventory during calls to confirm availability immediately.
- **Client Profiles:** The system must save data for permanent/large clients and seasonal bulk buyers (like churches or temples).
- **Order Reminders:** Staff should be able to search a client to see their typical monthly order patterns to remind them of what they usually buy.
- **Reservation System:** Orders move to a "Reserved" section so that stock is held but not yet "Sold".
- **Final Deduction:** Inventory is only officially deducted upon "Delivery".
- **Forecasting:** Admins need access to previous year/month data to plan production for seasonal items like 1-liter Payasam bottles.

### **5. Technical Specifications**

- **Roles:** Admin Web Portal (configuration and analytics) and a Production Mobile App (data entry).
- **Tally Integration (Manual):** The software will NOT handle billing or GST; it is strictly for inventory. Billing remains in Tally.
- **Hosting**: Node.js Server and Supabase (PostgreSQL) for reliability and real-time features.
- **Accessibility:** The web system should be accessible via browser (URL) for the admin, and the mobile app will be provided as an APK.