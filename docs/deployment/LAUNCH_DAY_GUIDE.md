# 🚀 Launch Day: Production Deployment Guide

This guide provides the complete, step-by-step workflow for safely deploying your stabilized `develop` features to the production environment.

## 📋 Pre-Launch Checklist
- [ ] **Tests are Green**: Verify that the latest commit on `develop` has a green checkmark in [GitHub Actions](https://github.com/rojinsdev/inventory-paulandsonsplastics/actions).
- [ ] **Database Backup**: (Optional but Recommended) Export a backup of your production Supabase data.
- [ ] **Final Smoke Test**: Run a final local test with `npm test` in the `server` directory.

---

## 🛫 Step 0: The "Pre-Flight" Check (Develop)
Before you even touch your production branch, ensure your current work is safe and tested on GitHub.

```bash
# 1. Stay on develop
git checkout develop

# 2. Commit all your latest changes
git add .
git commit -m "feat: your feature description"

# 3. Push to GitHub
git push origin develop
```
- **Action**: Go to the [GitHub Actions Dashboard](https://github.com/rojinsdev/inventory-paulandsonsplastics/actions).
- **Verify**: Wait for the "Develop CI" run to finish. **Only proceed to Step 1 if you see a GREEN checkmark.**

---

## 🛠️ Step 1: Synchronize Git Branches (Main)
Follow these exact commands to merge your validated `develop` work into `main`.

```bash
# 1. Switch to your production branch
git checkout main

# 2. Ensure your local main is up to date
git pull origin main

# 3. Merge your stabilized features (NEVER use --force)
git merge develop

# 4. Push to trigger the Production CI/CD
git push origin main
```

---

## 🏗️ Step 2: Synchronize Database (Supabase)
If your updates included any `server/migrations/` SQL files, you must apply them to the production Supabase project before the code deployment finishes.

1. **Check for New Migrations**: Open `server/migrations/` and identify any files created since the last launch.
2. **Apply to Production**: 
   - Open your [Supabase Dashboard](https://supabase.com/dashboard).
   - Go to **SQL Editor**.
   - Copy-paste the content of your new migration files and click **Run**.

---

## 🔍 Step 3: Monitor the CI/CD Pipeline
Once you push to `main`, GitHub Actions will start the `Production CI/CD` workflow.

> [!IMPORTANT]
> Do NOT interrupt this process. If it fails at the `test-server` or `test-web` step, your production server on EC2 will **NOT** be updated, which is good—it prevents a broken site.

- **Check Results Here**: [GitHub Actions - Production](https://github.com/rojinsdev/inventory-paulandsonsplastics/actions?query=workflow%3A%22Production+CI%2FCD%22)
- **Deployment**: If tests pass, look for the `deploy-server` job. It will report `✅ Deployed to EC2`.

---

## ✅ Step 4: Post-Launch Verification
After the pipeline turns green, verify the live system is healthy.

1. **Frontend**: Visit your production URL via Vercel. Refresh the cache to ensure you are seeing the latest version.
2. **Backend Health**: If you have SSH access to your EC2 instance, you can verify the server state:
   ```bash
   pm2 status             # Look for 'online' status
   pm2 logs inventory-server --lines 50  # Check for initial boot errors
   ```
3. **Database Check**: Perform one simple action (e.g., create a test order) to ensure the table schemas are correctly synchronized.

---

## 🔄 Step 5: Return to Development
Once production is confirmed stable, move back to your development branch for your next features.

```bash
git checkout develop
```

---

## 🛑 Rollback Procedure
If something goes critically wrong on the live site:
1. **Quick Revert**: Use `git revert <commit-hash>` on `main` and push.
2. **CI/CD Re-run**: The pipeline will automatically redeploy the previous stable version to EC2 and Vercel.
