# 🚀 Manual Update Guide for EC2 Server

This guide provides step-by-step instructions for manually updating the backend API on your AWS EC2 instance. This is a fallback for the automated GitHub Actions pipeline.

## 📋 Prerequisites

1.  **SSH Key:** `C:\Users\Rojins\Downloads\inventory-server-key.pem`
2.  **Server Address:** `api.paulandsonsplastics.com`
3.  **User:** `ubuntu`

---

## 🛠️ Step-by-Step Update Procedure

### 1. Connect to the Server
Open a terminal (PowerShell or Command Prompt) and run:
```powershell
ssh -i "C:\Users\Rojins\Downloads\inventory-server-key.pem" ubuntu@api.paulandsonsplastics.com
```

### 2. Navigate to the Server Directory
Once logged in, switch to the server folder:
```bash
cd /home/ubuntu/paulandsonsplastics/server
```

### 3. Update the Codebase
Fetch latest changes from the `main` branch:
```bash
git fetch origin
git reset --hard origin/main
```

### 4. Install Dependencies
Install any new packages added since the last update:
```bash
npm install
```

### 5. Build the Application
Compile the TypeScript code into production-ready JavaScript:
```bash
npm run build
```

### 6. Restart the Server (PM2)
Restart the process to apply changes:
```bash
pm2 restart inventory-server
```

---

## 🔍 Verification & Health Check

### Check Server Status
Ensure the process is "online":
```bash
pm2 status
```

### Test API Health
Visit the following URL in your browser:
[https://api.paulandsonsplastics.com/health](https://api.paulandsonsplastics.com/health)

Expected response:
```json
{ "status": "ok", "timestamp": "..." }
```

---

## 🚑 Troubleshooting

### Permission Denied (SSH Key)
If you get an error saying your PEM file's permissions are too open, run this in **PowerShell** on your local machine:
```powershell
icacls "C:\Users\Rojins\Downloads\inventory-server-key.pem" /inheritance:r
icacls "C:\Users\Rojins\Downloads\inventory-server-key.pem" /grant:r "$($env:USERNAME):(R)"
```

### Build Failures
If `npm run build` fails, try clearing the `dist` folder and rebuilding:
```bash
rm -rf dist
npm run build
```

### Port Already in Use
If the server fails to start because port 4000 is occupied:
```bash
pm2 stop inventory-server
pm2 start dist/server.js --name inventory-server
```
