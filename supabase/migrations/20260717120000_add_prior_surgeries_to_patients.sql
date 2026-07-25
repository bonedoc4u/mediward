-- Archive of superseded surgeries. Nullable — absence means no prior
-- surgeries (the overwhelming majority of patients). No RLS change needed:
-- same `patients` table, same existing tenant-scoped policies apply
-- automatically to the new column.
alter table patients add column if not exists prior_surgeries jsonb;
