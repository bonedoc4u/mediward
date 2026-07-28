-- rename_patient_ip_no inherited an implicit PUBLIC execute grant that the
-- project's other SECURITY DEFINER functions don't have (get_advisors flagged
-- it as callable by the anon role, unlike its siblings).
-- Revoke from PUBLIC and anon explicitly; authenticated keeps its grant.
revoke execute on function public.rename_patient_ip_no(text, text) from public;
revoke execute on function public.rename_patient_ip_no(text, text) from anon;
