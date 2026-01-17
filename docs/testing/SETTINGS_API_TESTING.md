# Settings API Testing Guide

## 🚀 Quick Start

### **Step 1: Run the Migration**

Execute this in Supabase SQL Editor:

```sql
-- Copy entire content from 005_create_system_settings.sql
-- This creates the table, indexes, triggers, RLS policies, and seeds 18 default settings
```

---

### **Step 2: Test with Postman**

Use your **admin token** from the previous login test.

---

## 🧪 API Endpoints

### **1. Get All Settings (Grouped by Category)**

```http
GET http://localhost:4000/api/settings
Authorization: Bearer YOUR_ADMIN_TOKEN
```

**Expected Response:**
```json
{
  "production": [
    {
      "key": "shift_runtime_hours",
      "value": 23,
      "category": "production",
      "display_name": "Shift Runtime (Hours)",
      "description": "Effective production hours per 24-hour shift",
      "data_type": "number",
      "is_editable": true
    },
    ...
  ],
  "inventory": [...],
  "sales": [...],
  "auth": [...],
  "dashboard": [...]
}
```

---

### **2. Get Settings by Category**

```http
GET http://localhost:4000/api/settings/category/production
Authorization: Bearer YOUR_ADMIN_TOKEN
```

**Expected Response:**
```json
[
  {
    "key": "shift_runtime_hours",
    "value": 23,
    "category": "production",
    "display_name": "Shift Runtime (Hours)",
    "description": "Effective production hours per 24-hour shift",
    "data_type": "number",
    "is_editable": true
  },
  {
    "key": "efficiency_warning_threshold",
    "value": 70,
    "category": "production",
    "display_name": "Efficiency Warning (%)",
    "description": "Alert when production efficiency drops below this percentage",
    "data_type": "number",
    "is_editable": true
  }
]
```

---

### **3. Get Single Setting Value**

```http
GET http://localhost:4000/api/settings/value/shift_runtime_hours
Authorization: Bearer YOUR_ADMIN_TOKEN
```

**Expected Response:**
```json
{
  "key": "shift_runtime_hours",
  "value": 23
}
```

---

### **4. Update Setting Value**

```http
PATCH http://localhost:4000/api/settings/shift_runtime_hours
Authorization: Bearer YOUR_ADMIN_TOKEN
Content-Type: application/json

{
  "value": 22
}
```

**Expected Response:**
```json
{
  "message": "Setting updated successfully",
  "key": "shift_runtime_hours",
  "value": 22
}
```

---

### **5. Update Boolean Setting**

```http
PATCH http://localhost:4000/api/settings/allow_partial_packing
Authorization: Bearer YOUR_ADMIN_TOKEN
Content-Type: application/json

{
  "value": false
}
```

---

### **6. Refresh Cache**

```http
POST http://localhost:4000/api/settings/refresh-cache
Authorization: Bearer YOUR_ADMIN_TOKEN
```

**Expected Response:**
```json
{
  "message": "Settings cache refreshed successfully"
}
```

---

## ✅ Validation Tests

### **Test 1: Value Out of Range**

```http
PATCH http://localhost:4000/api/settings/shift_runtime_hours
Authorization: Bearer YOUR_ADMIN_TOKEN
Content-Type: application/json

{
  "value": 30  ← Exceeds max (24)
}
```

**Expected Error:**
```json
{
  "error": "Value must be at most 24 for setting: shift_runtime_hours"
}
```

---

### **Test 2: Invalid Type**

```http
PATCH http://localhost:4000/api/settings/shift_runtime_hours
Authorization: Bearer YOUR_ADMIN_TOKEN
Content-Type: application/json

{
  "value": "twenty-three"  ← String instead of number
}
```

**Expected Error:**
```json
{
  "error": "Value must be a number for setting: shift_runtime_hours"
}
```

---

### **Test 3: Non-Admin User**

Try with a **Production Manager token** (when you create one):

```http
PATCH http://localhost:4000/api/settings/shift_runtime_hours
Authorization: Bearer PRODUCTION_MANAGER_TOKEN
Content-Type: application/json

{
  "value": 22
}
```

**Expected Error:**
```json
{
  "error": "Forbidden",
  "message": "Access denied. Required role: admin"
}
```

But they **can read**:

```http
GET http://localhost:4000/api/settings
Authorization: Bearer PRODUCTION_MANAGER_TOKEN
```

**Should work!** ✅

---

## 📊 All Default Settings

| Category | Key | Default | Type |
|----------|-----|---------|------|
| **Production** | | | |
| | `shift_runtime_hours` | 23 | number |
| | `maintenance_buffer_hours` | 1 | number |
| | `efficiency_warning_threshold` | 70 | number |
| | `cost_recovery_threshold` | 100 | number |
| | `allow_manual_production_edit` | false | boolean |
| **Inventory** | | | |
| | `default_items_per_packet` | 12 | number |
| | `default_packets_per_bundle` | 50 | number |
| | `low_stock_alert_bundles` | 10 | number |
| | `raw_material_wastage_percent` | 5 | number |
| | `allow_partial_packing` | true | boolean |
| **Sales** | | | |
| | `max_reservation_days` | 30 | number |
| | `allow_order_without_customer` | false | boolean |
| | `allow_partial_delivery` | false | boolean |
| | `allow_edit_delivered_orders` | false | boolean |
| **Authentication** | | | |
| | `session_timeout_minutes` | 60 | number |
| | `password_min_length` | 8 | number |
| **Dashboard** | | | |
| | `default_report_days` | 30 | number |
| | `recent_production_limit` | 10 | number |

---

## 🎯 Using Settings in Your Code

### **In Production Service:**

```typescript
import { SettingsService } from '../settings/settings.service';

// Get shift runtime
const shiftHours = await SettingsService.getValue<number>('shift_runtime_hours');
const effectiveMinutes = (shiftHours || 23) * 60; // Fallback to 23 if null

// Check efficiency threshold
const threshold = await SettingsService.getValue<number>('efficiency_warning_threshold');
if (efficiency < threshold) {
  // Send alert
}
```

### **In Inventory Service:**

```typescript
// Get default packing values
const itemsPerPacket = await SettingsService.getValue<number>('default_items_per_packet') || 12;
const allowPartial = await SettingsService.getValue<boolean>('allow_partial_packing') || true;
```

---

## 🚀 Next Steps

1. **Run the migration** in Supabase
2. **Test all endpoints** with Postman
3. **Update existing services** to use settings instead of hard-coded values
4. **Build Settings UI** in Web Admin Portal

**Ready to test?** 🎯
