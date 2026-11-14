-- Classified fractures per patient. Nullable — absence means no classified
-- fractures recorded (most patients, if their diagnosis isn't a fracture
-- classification use case). No RLS change needed: same `patients` table,
-- same existing tenant-scoped policies apply automatically to the new column.
alter table patients add column if not exists fractures jsonb;
