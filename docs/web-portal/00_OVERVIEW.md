# Web Admin Portal Documentation

## 1. Introduction
The **Web Admin Portal** is the central command center for Paul & Sons Plastics. It allows administrators and production managers to oversee the entire manufacturing lifecycle, from raw material intake to finished goods delivery.

## 2. Technology Stack
- **Framework**: [Next.js 14](https://nextjs.org/) (App Router)
- **Styling**: Vanilla CSS with CSS Variables (Design System tokens) for a consistent, premium look.
- **Icons**: [Lucide React](https://lucide.dev/)
- **Data Fetching**: Custom `fetchAPI` utility interacting with the backend.
- **Authentication**: Supabase Auth (via Context API).

## 3. Application Structure

### 3.1 Layout (`DashboardLayout`)
Every protected page is wrapped in the `DashboardLayout`, which provides:
- **Sidebar**: Fixed left navigation.
- **Header**: Top bar with current page title and User Profile/Logout.
- **Main Content**: Scrollable area for the page content.

### 3.2 Navigation (Sidebar)
The sidebar follows a strictly optimized operational flow:
1.  **Dashboard**: High-level KPI overview.
2.  **Inventory**: Detailed stock views (Semi-Finished -> Packed -> Finished -> Reserved).
3.  **Sales**: Customer and Order management.
4.  **Production Configuration**: Master data setup (Machines, Products).
5.  **Reports**: Historical data analysis.
6.  **System**: User access and system health.

### 3.3 Authentication Flow
- **Login**: `app/login/page.js` handles user credentials.
- **Protection**: `components/auth/ProtectedRoute.jsx` wraps the layout to ensure only authenticated users can access the system.
- **Context**: `lib/auth.js` (`AuthProvider`) manages the user session global state.
