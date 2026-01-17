# Supabase Setup Guide for Paul & Sons Inventory System

## 1. Finding the Connection String (Crucial)

If you cannot find "Connection String" in the Database Settings:

1.  Look at the **Top Right** of the Supabase Dashboard.
2.  Click the **"Connect"** button (green/primary button).
3.  A modal will appear. Select **"ORMs"** -> **"Node.js"**.
4.  **Copy the connection string** shown there.

## 2. Configuration Steps

1.  **Paste Credentials**:
    - Open `server/.env`.
    - Paste the connection string into the `DATABASE_URL` field.
    - **Replace `[YOUR-PASSWORD]`** with your actual database password.
    - Also fill `SUPABASE_URL` and `SUPABASE_KEY` (from **Settings -> API**).

2.  **Initialize Database**:
    - Open terminal in VS Code.
    - Run: `cd server`
    - Run: `npm run db:init`

3.  **Troubleshooting**:
    - If `npm run db:init` fails with "Modules not found", run `npm install` inside the server folder first.

---
**Note on Automating**: I tried to find it for you, but the AI connection was "Unauthorized". You must copy-paste it manually this time.
