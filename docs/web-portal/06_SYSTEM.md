# System Screens Documentation

## 1. Overview
The System section provides administrative control over the application, user access, and system health.

## 2. User Management
**Route**: `/users`
**Purpose**: Manage access for Production Managers and Admins.
**Features**:
- **Create User**: Add new staff with specific roles (`admin` or `production_manager`).
- **List Users**: View all accounts and their status.
- **Deactivate/Activate**: Control login access without deleting data.
**Security**: Only accessible by existing Admins.

## 3. System Settings
**Route**: `/system-settings`
**Purpose**: Global application configuration.
**Settings**:
- **Factory Shift Times**: Define start/end of shifts.
- **Allow Overproduction**: Toggle strict/loose validation logic.
- **Backup Configuration**: Database backup frequency.

## 4. Audit Logs
**Route**: `/audit-logs`
**Purpose**: Security and accountability trail.
**Data**:
- Records *who* did *what* and *when*.
- Types: User Login/Logout, User Creation, Sensitive Data Changes.
**Features**:
- Searchable log table.
- Filter by User, Action, or Date.

## 5. System Info
**Route**: `/system-info`
**Purpose**: Technical health check.
**Displays**:
- **Server Status**: Online/Offline check (`/health` endpoint).
- **Database Connection**: Supabase connectivity status.
- **Version**: App version (pkg.json).
