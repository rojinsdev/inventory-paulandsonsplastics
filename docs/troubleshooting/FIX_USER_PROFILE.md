# 🔍 Quick Database Check - Run This in Supabase SQL Editor

## Step 1: Check if user_profiles table exists

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'user_profiles';
```

**Expected Result:** One row showing `user_profiles`

**If empty:** You need to run migration `003_create_user_profiles.sql`

---

## Step 2: Check if auth user exists

```sql
SELECT id, email, created_at 
FROM auth.users 
WHERE email = 'admin@paulandsons.com';
```

**Expected Result:** One row with your admin user

**Copy the `id` (UUID)** - you'll need it in Step 3

---

## Step 3: Check if profile exists for this user

```sql
-- Replace 'YOUR-USER-ID-HERE' with the ID from Step 2
SELECT * FROM user_profiles 
WHERE id = 'YOUR-USER-ID-HERE';
```

**If empty:** This is the problem! Continue to Step 4.

---

## Step 4: Create the missing profile

```sql
-- Replace 'YOUR-USER-ID-HERE' with the actual UUID from Step 2
INSERT INTO user_profiles (id, email, role, active)
VALUES (
  'YOUR-USER-ID-HERE',  -- ← Paste UUID here
  'admin@paulandsons.com',
  'admin',
  true
);
```

---

## Step 5: Verify the fix

```sql
SELECT 
  u.id,
  u.email,
  up.role,
  up.active
FROM auth.users u
LEFT JOIN user_profiles up ON up.id = u.id
WHERE u.email = 'admin@paulandsons.com';
```

**Expected Result:**
```
id          | email                  | role  | active
------------|------------------------|-------|-------
{uuid}      | admin@paulandsons.com  | admin | true
```

---

## Step 6: Test login again

Now try the login again in Postman:

```http
POST http://localhost:4000/api/auth/login
Content-Type: application/json

{
  "email": "admin@paulandsons.com",
  "password": "Admin@123456"
}
```

**Should work now!** ✅

---

## 📝 Quick Summary

The issue is: **Auth user exists, but profile record is missing.**

**Fix:** Run Step 4 above to create the profile.

**Why this happened:** The `user_profiles` table was created after the auth user, so the profile wasn't auto-created.
