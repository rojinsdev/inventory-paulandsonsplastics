# Mobile Application Release Guide

This document outlines the standard operating procedure (SOP) for building, testing, and releasing the Paul & Sons Plastics mobile application using GitHub Actions.

## 🚀 The Branching Strategy

Our release flow follows a two-tier structure to ensure production stability:

| Branch | Purpose | Automated Action |
| :--- | :--- | :--- |
| **`develop`** | Feature work and daily updates. | Builds a **Testing APK** on every push. |
| **`main`** | Stable, production-ready code. | Builds a **Production APK** on every merge/push. |
| **Tags (`v*`)** | Explicit versioned releases. | Creates a **Formal GitHub Release** with APK attached. |

---

## 🛠️ How to Prepare a Release

When you are ready to prepare a new version for the client:

### 1. Update the Version
Modify the version in `apps/mobile/pubspec.yaml` before pushing your final changes.
- **Current Development Version**: `1.1.0+2` (Verified in latest build).

### 2. Push to `develop` & Test
Push your code to the `develop` branch. 
- Go to the **Actions** tab on GitHub.
- Select the `Mobile Release` workflow.
- **Latest Successful Build**: [Download APK (v1.1.0+2)](https://github.com/rojinsdev/inventory-paulandsonsplastics/actions/runs/24081459649/artifacts/6305768833).
- **Install and test this on your physical device.**


### 3. Deploy to Production (`main`)
Once the APK from `develop` is verified:
- Merge `develop` into `main`.
- This triggers the production build automatically. 

### 4. Create an Official Release (Tags)
To "Freeze" a version and create a download page for the client:
1.  In your terminal, run:
    ```bash
    git tag v1.1.0
    git push origin v1.1.0
    ```
2.  GitHub will automatically:
    - Create a new entry in the **Releases** section.
    - Generate release notes from your commits.
    - Attach the official APK for long-term storage.

---

## 🏗️ Automated Workflow Details

The system uses [mobile-release.yml](file:///d:/WORKS/SAAS/PaulAndSonsPlastics/inventory-production-system/.github/workflows/mobile-release.yml) to perform these tasks:

- **Build Tool**: Flutter SDK (stable channel).
- **Environment**: Ubuntu Linux Runner.
- **API Target**: `https://api.paulandsonsplastics.com/api` (Hardcoded for production reliability).
- **Manual Builds**: You can also trigger a build manually by clicking **"Run workflow"** in the GitHub Actions tab.

---

## 💡 Troubleshooting

- **Build Fails**: Check the **Actions** logs. Common issues include missing dependencies (fix: `flutter pub get`) or Kotlin version mismatches.
- **API Not Connecting**: Ensure the server is live and that your mobile device has internet access to reach the `api.paulandsonsplastics.com` endpoint.
- **Signing Issues**: The current build uses **Debug Signing**. If you plan to list the app on the Google Play Store, we will need to configure a Production Keystore.

> [!IMPORTANT]
> Always verify the `apiUrl` in the workflow file before a major production release to ensure it isn't pointing to a staging or local environment.
