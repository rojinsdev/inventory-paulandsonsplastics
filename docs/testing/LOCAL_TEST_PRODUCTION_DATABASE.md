# Local testing against the **production** Supabase database

Use this when you want your **local** API + **local** web app (and optionally the mobile app) to read/write the **same database** as production, without deploying new server code first.

**Warning:** Every create/update/delete hits **real production data** (orders, stock, payments, users). Prefer a short test window, avoid destructive experiments, and coordinate with anyone else using prod.

---

## How the pieces connect

| Piece | What it talks to | Env vars |
|--------|------------------|----------|
| **Node API** (`server/`) | Supabase Postgres + Auth (via JS client) | `SUPABASE_URL`, `SUPABASE_KEY` |
| **Next.js web** (`apps/web/`) | Your API for REST + Supabase **anon** client for Realtime/auth helpers | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| **Flutter mobile** | Only your **API** (not Supabase directly) | `--dart-define=API_URL=...` |

For local prod-DB testing, **all** of the above must agree:

- API uses **production** `SUPABASE_URL` + **service role** key (see `server/src/config/supabase.ts` — backend bypasses RLS).
- Web uses **production** `NEXT_PUBLIC_SUPABASE_*` (**anon** key from the **same** Supabase project).
- Web + mobile point `API_URL` at **your machine’s** running API (e.g. `http://localhost:4000/api`), **not** EC2, unless you intentionally test the deployed API instead.

**Project URLs (reference only — no secrets here):**

- **Dev** Supabase: `https://lvgxcganpwxeiyncudnq.supabase.co`
- **Prod** Supabase: `https://gncbejlrycumifdhucqr.supabase.co`

Keys always come from **Supabase Dashboard → Project Settings → API** (never commit them).

---

## Before you change anything (backup)

Copy your current local env files so you can restore **dev** in one step:

Suggested backup names (adjust if your files differ):

```text
server/.env.development          → server/.env.development.dev-backup
server/.env                      → server/.env.backup-YYYYMMDD
apps/web/.env.local              → apps/web/.env.local.backup-YYYYMMDD
```

**Restore dev DB only (one line, PowerShell, from `server/`):**

```powershell
Copy-Item -Force .env.development.dev-backup .env.development
```

Your repo may already have `.env.development.dev-backup` after switching to prod for local testing.

Or zip a folder `env-backup-YYYYMMDD/` with those files.

**Optional but useful:** paste **dev** values into a password manager note titled “Paul & Sons local dev Supabase” so you never rely on a single backup file.

---

## Switch local stack to **production** DB

### 1) API server (`server/`)

Edit the file you normally use for local runs (often `server/.env.development` when `NODE_ENV=development`, or `server/.env` — see `server/src/config/env.ts`).

Set:

```env
SUPABASE_URL=https://gncbejlrycumifdhucqr.supabase.co
SUPABASE_KEY=<production SERVICE ROLE secret key>
```

- Use the **service role** key for `SUPABASE_KEY` (backend must bypass RLS).  
- Using the **anon** key here commonly causes confusing failures (RLS blocks, missing rows).

Restart the API after saving.

### 2) Web app (`apps/web/`)

Create or edit `apps/web/.env.local` (Next.js loads this for local dev):

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api
NEXT_PUBLIC_SUPABASE_URL=https://gncbejlrycumifdhucqr.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<production anon public key>
```

- `NEXT_PUBLIC_*` must be from the **same** Supabase project as the API’s `SUPABASE_URL`.
- If the API runs on another host/port, change `NEXT_PUBLIC_API_URL` accordingly.

Restart `next dev` after saving.

### 3) Mobile (`apps/mobile/`)

Point the app at **your local API** (which is now using prod Supabase):

```bash
flutter run --dart-define=API_URL=http://192.168.1.XXX:4000/api
```

Use your PC’s LAN IP if the phone is on the same Wi‑Fi. Same URL you already used for dev API testing.

**Auth / tokens:** If you previously used dev, clear app storage or log out so you don’t send an old dev JWT to the local API (which would validate against prod auth after you switch).

---

## Verify quickly

1. Open web → log in with a **production** user (or create one in prod dashboard if policy allows).
2. Hit a read-only screen (e.g. orders list) — data should match what you see in prod Supabase **Table Editor** for that project.
3. Optionally create a **harmless** test record, then delete or correct it if your process allows.

---

## Switch **back** to **dev** (after testing)

1. Restore the backed-up files over `server/.env.development`, `server/.env`, and `apps/web/.env.local` (or re-paste **dev** values from your note).
2. Restart API and web.
3. Mobile: `flutter run --dart-define=API_URL=http://192.168.1.XXX:4000/api` again (same as before — only the server’s `.env` changed back to dev Supabase).

Confirm dev by checking Supabase URL in env files is **`lvgxcganpwxeiyncudnq`** again.

---

## Why “everything failed” after pushing to EC2 (common causes)

These are the usual mismatches between “works on my machine (dev DB)” and “prod server”:

1. **Wrong key on the server** — `SUPABASE_KEY` must be **service role** for this API, not anon.
2. **Wrong project** — prod EC2 `.env` still pointing at **dev** Supabase URL (or the reverse).
3. **Schema drift** — production DB missing migrations that dev already had (run pending files from `server/migrations/` on prod).
4. **CORS** — `ALLOWED_ORIGINS` on EC2 must include your real web origin(s).
5. **`NEXT_PUBLIC_*` on Vercel/hosting** — built with dev Supabase while API uses prod (or vice versa).

Deeper deployment steps: `docs/deployment/DEPLOYMENT_GUIDE.md`, `docs/server/EC2_MANUAL_SERVER_UPDATE.md`.

---

## Summary

| Goal | Action |
|------|--------|
| Local + **prod** data | Prod `SUPABASE_*` on **server**, prod `NEXT_PUBLIC_SUPABASE_*` on **web**, local `NEXT_PUBLIC_API_URL` → local API |
| Local + **dev** data | Restore backups / dev keys as above |
| Never mix | Same project for URL + anon + service role on one environment; don’t point web anon at dev while API uses prod |

Keep this doc as the checklist; your **secrets** stay only in env files and Supabase dashboard.
