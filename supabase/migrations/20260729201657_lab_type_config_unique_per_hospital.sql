-- lab_type_config.name was unique across ALL hospitals instead of per-hospital
-- (ward_config had this exact bug too, fixed in fix_ward_config_unique_per_hospital)
-- — blocking any two hospitals from both configuring a lab type with the same
-- name (e.g. "FBS", "CRP"). Scope uniqueness to (name, hospital_id) instead.
ALTER TABLE lab_type_config
  DROP CONSTRAINT lab_type_config_name_key,
  ADD CONSTRAINT uq_lab_type_name_per_hospital UNIQUE (name, hospital_id);
