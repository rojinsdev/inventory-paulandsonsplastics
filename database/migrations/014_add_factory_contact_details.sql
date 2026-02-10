-- Migration: Add contact details to factories table

BEGIN;

-- Add contact columns
ALTER TABLE factories ADD COLUMN IF NOT EXISTS contact_person TEXT;
ALTER TABLE factories ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE factories ADD COLUMN IF NOT EXISTS contact_email TEXT;

COMMIT;
