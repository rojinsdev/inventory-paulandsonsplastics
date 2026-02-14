# Plan: Universal Multi-Unit Packaging System

> [!NOTE]
> This document outlines the planned implementation for flexible packing types (Bags, Boxes, Bundles) to be implemented in a future sprint.

## Core Architecture

### 1. Flexible Packaging Standards
Instead of hardcoded "Bundle" fields, each product will support **Multiple Packaging Options**. 
Entries in the configuration will define:
- **Unit Name**: (e.g., "Standard Bag", "Export Box", "Bulk Bundle")
- **Content Type**: (Loose Items OR Packets)
- **Ratio**: (e.g., 50 items/bag OR 10 packets/bundle)

### 2. The "Packet" Layer (Optional)
The system will treat "Packed (Packets)" as a middle-state inventory that is only used if the selected Master Unit requires it.
- **Direct Packing**: Loose -> Bag (Uses `Items per Bag`)
- **Layered Packing**: Loose -> Packet -> Master (Uses `Items per Packet` and `Packets per Bundle`)

## User Workflows

### 1. Admin/Owner (Web Interface)
1.  **Product Setup**: When creating/editing a product, the Admin selects the **Master Unit** (Bag, Box, Bundle, etc.) and defines the **Items per Unit**.
2.  **Dashboard View**: The inventory table dynamically changes headers or labels. Instead of "Finished Stock (Bundles)", it shows "Finished Stock (Unit)", displaying "10 Bags" or "50 Boxes" as appropriate.

### 2. Product Manager (Mobile App)
The manager sees the correct buttons based on how the product is "Packaged":

**Flow A: The 2-Step Product (e.g., Pipe Bundle with Packets)**
1.  **Step 1**: Manager sees a button **"Pack into Packets"**.
    - *Example*: They put 1,000 loose pipes into packets of 12.
    - *Result*: 83 Packets created.
2.  **Step 2**: Manager sees a button **"Move to Bundles"**.
    - *Example*: They put those packets into bundles of 50.
    - *Result*: Stock moves to "Finished: 1 Bundle".

**Flow B: The 1-Step Product (e.g., Fittings in a Bag)**
1.  **Direct Step**: Manager **only** sees a button **"Pack into Bags"**.
    - *Example*: They put 1,000 fittings directly into Bags of 50 pieces.
    - *Result*: The system skips the "Packet" step and moves directly from "Loose" to "Finished: 20 Bags".

### 3. Sales Manager (Web Interface)
1.  **Create Invoice**: When adding a product to a sale, the unit label automatically updates.
    - "Invoice for 10 **Bags** of Fitting A".
    - "Invoice for 5 **Bundles** of Pipe B".

## Technical Implementation Details

### Database Changes
Add `master_unit_type` and `packaging_flow` to the `products` table. This allows the system to toggle between "Loose -> Master" and "Loose -> Packet -> Master" automatically.

### UI Synchronization
- The Mobile App will look at the product's `master_unit_type` and rename the "Bundles" button to "Bags" or "Boxes" dynamically.
- The "Sales Order" printout will use the product's specific unit name for professionalism.
