# Paul & Sons Plastics - Inventory & Production System

> 🔒 **PRIVATE REPOSITORY** - Internal Use Only  
> This software is a proprietary internal tool for Paul & Sons Plastics. It is **not** open-source software.

## 📖 System Overview

This system is a custom **Inventory and Production Management Solution** designed to track factory operations from raw material to finished goods delivery. It acts as the single source of truth for production efficiency, stock levels, and daily cost recovery.

**Core Objectives:**
*   **Track Production Efficiency:** Compare machine actual output vs. theoretical capacity.
*   **Manage Inventory Flow:** Strict state transitions: `Semi-Finished` → `Packed` → `Finished` → `Reserved` → `Delivered`.
*   **Live Stock Visibility:** Real-time "Available to Promise" stock for the sales team.
*   **Cost Analysis:** Daily verification of machine running costs (₹7k-8k/day) against output value.

---

## 🏗️ Architecture

The system is built as a modular monorepo:

| Component | Tech Stack | Purpose |
| :--- | :--- | :--- |
| **Backend API** | Node.js (Express) | Core logic, inventory state machine, role-based access. |
| **Database** | PostgreSQL (Supabase) | Relational data, Row Level Security (RLS). |
| **Web Portal** | Next.js | Admin dashboard, master configuration, sales management. |
| **Mobile App** | Flutter | Simple daily production entry for factory floor staff. |

---

## 👥 User Roles

1.  **Admin / Owner (Web):**
    *   Full access to all configurations (Machines, Products, Formulas).
    *   Manages Sales Orders, sets reservations, and confirms deliveries.
    *   Views financial and efficiency analytics.

2.  **Production Manager (Mobile):**
    *   Strictly operational access.
    *   Enters daily production logs.
    *   Manages packing and bundling workflows.
    *   **No access** to sales data, customer info, or system settings.

---

## 🚀 Getting Started

### Prerequisites
*   Node.js (v18+)
*   npm or yarn
*   Git

### Installation
1.  **Clone the repository:**
    ```bash
    git clone https://github.com/rojins0209/Paul-Sons-Plastics-Inventory.git
    cd Paul-Sons-Plastics-Inventory
    ```

2.  **Install dependencies:**
    ```bash
    # Server
    cd server
    npm install

    # Web App
    cd ../apps/web
    npm install
    
    # Mobile App
    cd ../apps/mobile
    flutter pub get
    ```

3.  **Environment Setup:**
    *   Create a `.env` file in the `server/` directory.
    *   Create a `.env.local` file in the `apps/web/` directory.
    *   Refer to [docs/setup/SUPABASE_SETUP.md](docs/setup/SUPABASE_SETUP.md) for variable keys.

### Running the Application
*   **Server:** `npm run dev` (Port 4000)
*   **Web Portal:** `npm run dev` (Port 3000)
*   **Mobile App:** `flutter run`

---

## 📂 Documentation

Detailed documentation is available in the `docs/` directory:

*   **General:**
    *   [Business Requirements](docs/general/BUSINESS_REQUIREMENTS.md)
    *   [System Workflows](docs/general/SYSTEM%20WORKFLOWS.md)
*   **Mobile App:**
    *   [Architecture & Features](docs/mobile_app/)
*   **Setup:**
    *   [Supabase & Tech Stack](docs/setup/)
*   **Testing:**
    *   [API Testing Guides](docs/testing/)

---

## ⚠️ Important Boundaries

To maintain efficiency, this system intentionally **EXCLUDES**:
*   ❌ Billing & Invoicing (Handled by Tally)
*   ❌ GST Calculations
*   ❌ HR / Payroll Management
