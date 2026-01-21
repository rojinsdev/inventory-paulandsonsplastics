-- Add name column to user_profiles for display purposes
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS name TEXT;
