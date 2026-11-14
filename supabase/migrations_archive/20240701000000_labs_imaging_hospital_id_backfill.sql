-- Migration: 20240701000000_labs_imaging_hospital_id_backfill.sql
-- Backfill hospital_id on labs/imaging rows that were inserted before the
-- column existed or before the app started sending it.
-- Rows with NULL hospital_id are invisible through RLS (NULL = anything → NULL ≠ TRUE).

UPDATE public.labs l
SET    hospital_id = p.hospital_id
FROM   public.patients p
WHERE  l.patient_ip_no = p.ip_no
AND    l.hospital_id   IS NULL;

UPDATE public.imaging i
SET    hospital_id = p.hospital_id
FROM   public.patients p
WHERE  i.patient_ip_no = p.ip_no
AND    i.hospital_id   IS NULL;

-- Make hospital_id NOT NULL going forward to catch future omissions at DB level.
-- Requires backfill above to have zero remaining NULLs.
ALTER TABLE public.labs    ALTER COLUMN hospital_id SET NOT NULL;
ALTER TABLE public.imaging ALTER COLUMN hospital_id SET NOT NULL;
