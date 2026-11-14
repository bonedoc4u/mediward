-- Migration: 20240901000000_drop_password_hash.sql
-- Remove SHA-256 legacy password column and verify function.
-- All auth is now handled by Supabase Auth (GoTrue/bcrypt).
-- This eliminates a dual-auth attack surface and reduces PHI scope.

DROP FUNCTION IF EXISTS public.verify_app_user_password(TEXT, TEXT);
ALTER TABLE public.app_users DROP COLUMN IF EXISTS password_hash;
