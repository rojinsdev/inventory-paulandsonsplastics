# AWS EC2 Deployment Guide

This guide explains how to deploy the Paul & Sons Plastics Inventory & Production System backend to an AWS EC2 instance.

## 1. AWS Console Setup

### Launching the Instance
1.  **Open AWS Console** and navigate to **EC2**.
2.  Click **Launch Instance**.
3.  **Name**: `Inventory-Production-Server`.
4.  **AMI**: Choose `Amazon Linux 2023` (Free Tier eligible).
5.  **Instance Type**: `t3.micro` (or `t2.micro` depending on your region's Free Tier).
6.  **Key Pair**: Create a new key pair (.pem), download it, and **save it securely**.
7.  **Network Settings**: Create a security group and allow:
    *   **SSH** (Port 22) from your IP.
    *   **Custom TCP** (Port 4000) from Anywhere (0.0.0.0/0).

## 2. Server Environment Setup

Once you've connected to your instance via SSH:

### Install Node.js & Git
```bash
sudo yum update -y
sudo yum install git -y
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
```

### Install PM2 (Process Manager)
```bash
npm install -g pm2
```

## 3. Deploying the Code

1.  **Clone the Repo**:
    ```bash
    git clone <your-repo-url>
    cd inventory-production-system/server
    ```
2.  **Install Dependencies**:
    ```bash
    npm install
    ```
3.  **Setup Environment Variables**:
    *   Copy `.env.production.example` to `.env`.
    *   Edit `.env` using `nano .env` and fill in your Supabase credentials.
4.  **Build & Start**:
    ```bash
    npm run build
    pm2 start ecosystem.config.js
    pm2 save
    pm2 startup
    ```

## 4. Maintenance

*   **View Logs**: `pm2 logs inventory-server`
*   **Restart Server**: `pm2 restart inventory-server`
*   **Stop Server**: `pm2 stop inventory-server`

## 5. Billing Safety (CRITICAL)

To ensure you never get a surprise bill, follow these steps in your AWS Console:

1.  **Enable Billing Alerts**:
    *   Search for "Billing" in the top search bar.
    *   Go to **Billing Preferences**.
    *   Check the box: **"Receive Free Tier Usage Alerts"**.
    *   Check the box: **"Receive Billing Alerts"**.
2.  **Set a Budget**:
    *   Go to **AWS Budgets**.
    *   Click **Create Budget** -> **Zero Spend Budget**.
    *   This will send you an email as soon as your spending hits $0.01 (1 cent).
3.  **Check Credits**:
    *   Go to **Billing** -> **Credits** to see your remaining AWS credits and their expiration dates.
