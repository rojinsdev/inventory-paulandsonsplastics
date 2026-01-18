# Production Deployment Guide

This guide outlines the steps to deploy the Inventory & Production System server to a production environment (typically a Linux VPS like DigitalOcean, AWS EC2, or Linode).

## Prerequisites

1.  **Server**: A Linux server (Ubuntu 20.04 or 22.04 LTS recommended).
2.  **Domain**: A domain name configured to point to your server's IP address.
3.  **Supabase**: Your Supabase project URL and Keys.

---

## Step 1: Server Setup (First Time Only)

Update the system and install essential tools.

```bash
# Update OS
sudo apt update && sudo apt upgrade -y

# Install Node.js (v18)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 (Process Manager)
sudo npm install -g pm2

# Install Nginx (Web Server)
sudo apt install nginx -y

# Install Git
sudo apt install git -y
```

---

## Step 2: Deploy Code

Clone the repository and install dependencies.

```bash
# Clone
git clone <YOUR_REPO_URL>
cd inventory-production-system/server

# Install Dependencies
npm install

# Build TypeScript to JavaScript
npm run build
```

**Crucial**: Create your `.env` file on the server.
```bash
nano .env
```
Paste your production credentials:
```env
PORT=4000
NODE_ENV=production
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key-DO-NOT-SHARE
```

---

## Step 3: Start Application with PM2

We use PM2 to keep the app alive. We have included a `ecosystem.config.js` file for this.

```bash
# Start the app using the config
pm2 start ecosystem.config.js

# Save the list so it respawns on reboot
pm2 save

# Setup startup script
pm2 startup
# (Run the command outputted by the previous step)
```

---

## Step 4: Configure Nginx (Reverse Proxy)

Nginx will accept traffic on port 80 (HTTP) and forward it to your app on port 4000.

Create a new config file:
```bash
sudo nano /etc/nginx/sites-available/inventory-api
```

Paste the following configuration:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com; # REPLACE THIS with your actual domain

    location / {
        proxy_pass http://localhost:4000; # Forwarding to Node.js
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/inventory-api /etc/nginx/sites-enabled/
sudo nginx -t # Test config for errors
sudo systemctl restart nginx
```

---

## Step 5: SSL (HTTPS)

Secure your API using Certbot (Let's Encrypt).

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d api.yourdomain.com
```

---

## Quick Reference Commands

| Action | Command |
| :--- | :--- |
| **Deploy New Code** | `git pull && npm install && npm run build && pm2 restart inventory-server` |
| **Check Logs** | `pm2 logs inventory-server` |
| **Monitor Status** | `pm2 monit` |
