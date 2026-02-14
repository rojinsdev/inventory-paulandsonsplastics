# Paul & Sons Plastics - Inventory & Production System

An enterprise-grade, real-time management system for Paul & Sons Plastics. This monorepo contains the web dashboard, API server, and shared configurations for a multi-factory production environment.

## 🚀 Key Features

### 🏭 Multi-Factory & Production
- **Multi-Factory Support**: Manage multiple production sites from a single dashboard.
- **Production Planning**: Advanced scheduling for machine runs and staff.
- **Real-Time Visibility**: Track stock levels and machine status as they happen.
- **Recipe & Packaging**: Manage product raw material mappings and multi-unit sales (Bundles, Bags, Boxes).

### 📊 Business Intelligence
- **Customer Analytics**: Track VIP clients, buying patterns, and order history.
- **Smart Stock Allocation**: Reserve stock for high-priority sales orders.
- **Inventory Audit Logs**: Full traceability of every stock movement.
- **Machine Efficiency**: Monitor production costs and recovery rates.

### 🛡️ Security & Access
- **Role-Based Access Control (RBAC)**: Distinct views for Admin, Factory Manager, and Staff.
- **Row-Level Security (RLS)**: Data isolation powered by Supabase.
- **Audit Trails**: Tracking who performed every action in the system.

## 🏗️ Architecture

This is a **Monorepo** built with modern web technologies:

- **`apps/web`**: Next.js dashboard with a premium UI (Vercel).
- **`server`**: Dockerized Node.js API server (Railway).
- **`database`**: Supabase (PostgreSQL) with Real-time extensions and Auth.

## 🌐 Infrastructure & Deployment

The system is deployed using a professional CI/CD pipeline:

1.  **Work**: Push code to the `develop` branch on GitHub.
2.  **Test**: Vercel creates a private "Preview" site for verification.
3.  **Launch**: Merge code into the `main` branch.
4.  **Auto-Deploy**:
    - **Frontend**: Vercel updates the production site automatically.
    - **Backend**: Railway builds a new **Docker** container and restarts the API with zero downtime.
5.  **Database**: Managed via Supabase with production/dev environment separation.

## 🛠️ Development Workflow

To ensure system stability, we follow a strict branching model:

- **`develop` Branch**: Your active workshop. All new features and fixes happen here.
- **`main` Branch**: The "Showroom." Only stable, production-ready code is pushed here.

### Daily Routine:
1.  Sync latest code: `git pull origin develop`
2.  Work on features.
3.  Commit & Push: `git add .`, `git commit -m "feat: description"`, `git push origin develop`.

## ⚙️ Getting Started

### Prerequisites
- Node.js (v18+)
- Docker (for local server development)
- Supabase CLI

### Setup
1.  Clone the repository from the new business account:
    ```bash
    git clone https://github.com/rojinsdev/inventory-paulandsonsplastics.git
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Configure Environment Variables:
    Create `.env` files in both `apps/web` and `server` based on the `.env.example` templates.

## 📄 Documentation
Detailed technical guides can be found in the `/docs` folder:
- [Infrastructure Plan](file:///d:/WORKS/SAAS/PaulAndSonsPlastics/inventory-production-system/docs/setup/INFRASTRUCTURE_PLAN.md)
- [Database Schema](file:///d:/WORKS/SAAS/PaulAndSonsPlastics/inventory-production-system/docs/database/README.md)
- [System Workflows](file:///d:/WORKS/SAAS/PaulAndSonsPlastics/inventory-production-system/docs/general/SYSTEM%20WORKFLOWS.md)

---
© 2026 Paul & Sons Plastics. Built for excellence in plastic manufacturing.
