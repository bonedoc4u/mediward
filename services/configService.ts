/**
 * configService.ts
 * CRUD operations for ward_config and lab_type_config tables.
 * Both tables are read by all authenticated users; writes are admin-only (enforced in-app).
 */

import { supabase } from '../lib/supabase';
import { WardConfig, LabTypeConfig, HospitalConfig, MedicationConfig } from '../types';

// ─── Row parsers ───

function parseWardRow(row: Record<string, unknown>): WardConfig {
  return {
    id:        String(row.id),
    name:      String(row.name),
    sortOrder: Number(row.sort_order ?? 0),
    isIcu:     Boolean(row.is_icu),
    active:    Boolean(row.active ?? true),
    unit:      Array.isArray(row.unit) && row.unit.length > 0 ? (row.unit as string[]) : undefined,
  };
}

function parseLabRow(row: Record<string, unknown>): LabTypeConfig {
  return {
    id:        String(row.id),
    name:      String(row.name),
    unit:      String(row.unit ?? ''),
    alertHigh: row.alert_high != null ? Number(row.alert_high) : null,
    category:  String(row.category ?? 'General'),
    sortOrder: Number(row.sort_order ?? 0),
    active:    Boolean(row.active ?? true),
  };
}

// ─── Ward Config ───

export async function fetchWards(hospitalId?: string): Promise<WardConfig[]> {
  let query = supabase.from('ward_config').select('*').order('sort_order');
  if (hospitalId) query = query.eq('hospital_id', hospitalId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(parseWardRow);
}

export async function createWard(
  name: string, isIcu: boolean, sortOrder: number, unit?: string[],
): Promise<WardConfig> {
  const { data, error } = await supabase
    .from('ward_config')
    .insert({ name, is_icu: isIcu, sort_order: sortOrder, active: true, unit: unit?.length ? unit : null })
    .select()
    .single();
  if (error) throw error;
  return parseWardRow(data);
}

export async function updateWard(ward: WardConfig): Promise<void> {
  const { error } = await supabase
    .from('ward_config')
    .update({
      name:       ward.name,
      is_icu:     ward.isIcu,
      sort_order: ward.sortOrder,
      active:     ward.active,
      unit:       ward.unit?.length ? ward.unit : null,
    })
    .eq('id', ward.id);
  if (error) throw error;
}

export async function deleteWard(id: string): Promise<void> {
  const { error } = await supabase
    .from('ward_config')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ─── Lab Type Config ───

export async function fetchLabTypes(hospitalId?: string): Promise<LabTypeConfig[]> {
  let query = supabase.from('lab_type_config').select('*').order('category').order('sort_order');
  if (hospitalId) query = query.eq('hospital_id', hospitalId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(parseLabRow);
}

export async function createLabType(
  name: string, unit: string, alertHigh: number | null,
  category: string, sortOrder: number,
): Promise<LabTypeConfig> {
  const { data, error } = await supabase
    .from('lab_type_config')
    .insert({ name, unit, alert_high: alertHigh, category, sort_order: sortOrder, active: true })
    .select()
    .single();
  if (error) throw error;
  return parseLabRow(data);
}

export async function updateLabType(lab: LabTypeConfig): Promise<void> {
  const { error } = await supabase
    .from('lab_type_config')
    .update({
      name:       lab.name,
      unit:       lab.unit,
      alert_high: lab.alertHigh,
      category:   lab.category,
      sort_order: lab.sortOrder,
      active:     lab.active,
    })
    .eq('id', lab.id);
  if (error) throw error;
}

export async function deleteLabType(id: string): Promise<void> {
  const { error } = await supabase
    .from('lab_type_config')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ─── Hospital Config ───

const DEFAULT_PREOP_TEMPLATE = [
  'Consent', 'Pre-OP Order', 'Inj. Cefuroxime', 'Part Preparation (Shave)',
  'Pre-OP X-Ray', 'C-Sample (Cross Match)', 'CBD (Catheter)', 'Implant Order', 'Things / Materials',
];

const DEFAULT_HOSPITAL_CONFIG: HospitalConfig = {
  hospitalName: 'MY HOSPITAL',
  department: 'DEPARTMENT OF MEDICINE',
  units: ['Unit 1', 'Unit 2', 'Unit 3'],
  preOpModuleName: 'Pre-op Clearance',
  procedureListName: 'Procedure List',
  preOpChecklistTemplate: DEFAULT_PREOP_TEMPLATE,
};

export async function fetchHospitalConfig(hospitalId?: string): Promise<HospitalConfig> {
  let query = supabase
    .from('hospital_config')
    .select('hospital_name, department, units, pre_op_module_name, procedure_list_name, pre_op_checklist_template');
  if (hospitalId) query = (query as any).eq('hospital_id', hospitalId);
  const { data, error } = await (query as any).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_HOSPITAL_CONFIG;
  return {
    hospitalName:      String(data.hospital_name ?? DEFAULT_HOSPITAL_CONFIG.hospitalName),
    department:        String(data.department    ?? DEFAULT_HOSPITAL_CONFIG.department),
    units: Array.isArray(data.units) && data.units.length > 0
      ? data.units as string[]
      : DEFAULT_HOSPITAL_CONFIG.units,
    preOpModuleName:        String(data.pre_op_module_name   ?? DEFAULT_HOSPITAL_CONFIG.preOpModuleName),
    procedureListName:      String(data.procedure_list_name  ?? DEFAULT_HOSPITAL_CONFIG.procedureListName),
    preOpChecklistTemplate: Array.isArray(data.pre_op_checklist_template) && data.pre_op_checklist_template.length > 0
      ? data.pre_op_checklist_template as string[]
      : DEFAULT_PREOP_TEMPLATE,
  };
}

export async function upsertHospitalConfig(config: HospitalConfig): Promise<void> {
  // Fetch existing row id so we can UPDATE; INSERT if none exists.
  const { data: existing } = await supabase
    .from('hospital_config')
    .select('id')
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from('hospital_config')
      .update({
        hospital_name:       config.hospitalName,
        department:          config.department,
        units:               config.units,
        pre_op_module_name:         config.preOpModuleName,
        procedure_list_name:        config.procedureListName,
        pre_op_checklist_template:  config.preOpChecklistTemplate,
        updated_at:                 new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('hospital_config')
      .insert({
        hospital_name:              config.hospitalName,
        department:                 config.department,
        units:                      config.units,
        pre_op_module_name:         config.preOpModuleName,
        procedure_list_name:        config.procedureListName,
        pre_op_checklist_template:  config.preOpChecklistTemplate,
      });
    if (error) throw error;
  }
}

// ─── Medication Config ────────────────────────────────────────────────────────

function parseMedRow(row: Record<string, unknown>): MedicationConfig {
  return {
    id:        String(row.id),
    name:      String(row.name),
    brand:     String(row.brand ?? ''),
    category:  String(row.category ?? 'General'),
    form:      String(row.form ?? 'Tablet'),
    strength:  String(row.strength ?? ''),
    sortOrder: Number(row.sort_order ?? 0),
    active:    Boolean(row.active ?? true),
  };
}

export async function fetchMedications(hospitalId?: string): Promise<MedicationConfig[]> {
  let query = supabase.from('medication_config').select('*').order('category').order('name');
  if (hospitalId) query = query.eq('hospital_id', hospitalId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(parseMedRow);
}

export async function createMedication(
  med: Omit<MedicationConfig, 'id'>,
): Promise<MedicationConfig> {
  const { data, error } = await supabase
    .from('medication_config')
    .insert({
      name:       med.name,
      brand:      med.brand,
      category:   med.category,
      form:       med.form,
      strength:   med.strength,
      sort_order: med.sortOrder,
      active:     med.active,
    })
    .select()
    .single();
  if (error) throw error;
  return parseMedRow(data);
}

export async function updateMedication(med: MedicationConfig): Promise<void> {
  const { error } = await supabase
    .from('medication_config')
    .update({
      name:       med.name,
      brand:      med.brand,
      category:   med.category,
      form:       med.form,
      strength:   med.strength,
      sort_order: med.sortOrder,
      active:     med.active,
    })
    .eq('id', med.id);
  if (error) throw error;
}

export async function deleteMedication(id: string): Promise<void> {
  const { error } = await supabase.from('medication_config').delete().eq('id', id);
  if (error) throw error;
}

/** Bulk-seed the default Indian medication list for a hospital.
 *  Skips if the hospital already has any medications. */
export async function seedDefaultMedications(hospitalId = 'default'): Promise<void> {
  const { count } = await supabase
    .from('medication_config')
    .select('id', { count: 'exact', head: true })
    .eq('hospital_id', hospitalId);
  if ((count ?? 0) > 0) return; // already seeded

  const rows = DEFAULT_INDIAN_MEDICATIONS.map((m, i) => ({
    hospital_id: hospitalId,
    name:        m.name,
    brand:       m.brand ?? '',
    category:    m.category,
    form:        m.form,
    strength:    m.strength ?? '',
    sort_order:  i,
    active:      true,
  }));

  // Insert in batches of 100
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase.from('medication_config').insert(rows.slice(i, i + 100));
    if (error) throw error;
  }
}

// ─── Comprehensive Indian Medication List ────────────────────────────────────
type MedSeed = { name: string; brand?: string; category: string; form: string; strength?: string };

export const DEFAULT_INDIAN_MEDICATIONS: MedSeed[] = [
  // ── Analgesics & NSAIDs ──
  { name: 'Paracetamol', brand: 'Calpol / Dolo / Crocin', category: 'Analgesic', form: 'Tablet', strength: '500mg' },
  { name: 'Paracetamol', brand: 'Calpol / Dolo', category: 'Analgesic', form: 'Tablet', strength: '650mg' },
  { name: 'Paracetamol', brand: 'Calpol', category: 'Analgesic', form: 'Syrup', strength: '120mg/5ml' },
  { name: 'Ibuprofen', brand: 'Brufen', category: 'Analgesic', form: 'Tablet', strength: '400mg' },
  { name: 'Ibuprofen + Paracetamol', brand: 'Combiflam', category: 'Analgesic', form: 'Tablet', strength: '400mg+325mg' },
  { name: 'Diclofenac', brand: 'Voveran', category: 'Analgesic', form: 'Tablet', strength: '50mg' },
  { name: 'Diclofenac SR', brand: 'Voveran SR', category: 'Analgesic', form: 'Tablet', strength: '75mg' },
  { name: 'Diclofenac', brand: 'Voveran', category: 'Analgesic', form: 'Injection', strength: '75mg/3ml' },
  { name: 'Aceclofenac', brand: 'Zerodol', category: 'Analgesic', form: 'Tablet', strength: '100mg' },
  { name: 'Aceclofenac + Paracetamol', brand: 'Zerodol-P', category: 'Analgesic', form: 'Tablet', strength: '100mg+325mg' },
  { name: 'Naproxen', brand: 'Naprosyn', category: 'Analgesic', form: 'Tablet', strength: '500mg' },
  { name: 'Etoricoxib', brand: 'Arcoxia / Nucoxia', category: 'Analgesic', form: 'Tablet', strength: '60mg' },
  { name: 'Etoricoxib', brand: 'Arcoxia / Nucoxia', category: 'Analgesic', form: 'Tablet', strength: '90mg' },
  { name: 'Celecoxib', brand: 'Celebrex', category: 'Analgesic', form: 'Capsule', strength: '100mg' },
  { name: 'Celecoxib', brand: 'Celebrex', category: 'Analgesic', form: 'Capsule', strength: '200mg' },
  { name: 'Meloxicam', brand: 'Mobic', category: 'Analgesic', form: 'Tablet', strength: '7.5mg' },
  { name: 'Meloxicam', brand: 'Mobic', category: 'Analgesic', form: 'Tablet', strength: '15mg' },
  { name: 'Nimesulide', brand: 'Nimulid', category: 'Analgesic', form: 'Tablet', strength: '100mg' },
  { name: 'Ketorolac', brand: 'Toradol', category: 'Analgesic', form: 'Injection', strength: '30mg/ml' },
  { name: 'Tramadol', brand: 'Contramal / Ultracet', category: 'Analgesic', form: 'Tablet', strength: '50mg' },
  { name: 'Tramadol', brand: 'Contramal', category: 'Analgesic', form: 'Injection', strength: '50mg/ml' },
  { name: 'Morphine', brand: 'Morphgesic', category: 'Analgesic', form: 'Injection', strength: '10mg/ml' },
  { name: 'Aspirin', brand: 'Ecosprin', category: 'Analgesic', form: 'Tablet', strength: '75mg' },
  { name: 'Aspirin', brand: 'Ecosprin', category: 'Analgesic', form: 'Tablet', strength: '150mg' },
  { name: 'Piroxicam', brand: 'Feldene', category: 'Analgesic', form: 'Tablet', strength: '20mg' },
  { name: 'Pentazocine', brand: 'Fortwin', category: 'Analgesic', form: 'Injection', strength: '30mg/ml' },

  // ── Antibiotics (Oral) ──
  { name: 'Amoxicillin', brand: 'Mox / Amoxil', category: 'Antibiotic', form: 'Capsule', strength: '250mg' },
  { name: 'Amoxicillin', brand: 'Mox / Amoxil', category: 'Antibiotic', form: 'Capsule', strength: '500mg' },
  { name: 'Amoxicillin + Clavulanate', brand: 'Augmentin / Moxclav', category: 'Antibiotic', form: 'Tablet', strength: '625mg' },
  { name: 'Amoxicillin + Clavulanate', brand: 'Augmentin', category: 'Antibiotic', form: 'Tablet', strength: '1000mg' },
  { name: 'Ampicillin + Cloxacillin', brand: 'Cloxamp / Ampiclox', category: 'Antibiotic', form: 'Capsule', strength: '250mg+250mg' },
  { name: 'Azithromycin', brand: 'Azee / Zithromax', category: 'Antibiotic', form: 'Tablet', strength: '250mg' },
  { name: 'Azithromycin', brand: 'Azee / Zithromax', category: 'Antibiotic', form: 'Tablet', strength: '500mg' },
  { name: 'Ciprofloxacin', brand: 'Cifran / Ciplox', category: 'Antibiotic', form: 'Tablet', strength: '250mg' },
  { name: 'Ciprofloxacin', brand: 'Cifran / Ciplox', category: 'Antibiotic', form: 'Tablet', strength: '500mg' },
  { name: 'Ofloxacin', brand: 'Zanocin', category: 'Antibiotic', form: 'Tablet', strength: '200mg' },
  { name: 'Ofloxacin', brand: 'Zanocin', category: 'Antibiotic', form: 'Tablet', strength: '400mg' },
  { name: 'Levofloxacin', brand: 'Levomac / Levoflox', category: 'Antibiotic', form: 'Tablet', strength: '250mg' },
  { name: 'Levofloxacin', brand: 'Levomac / Levoflox', category: 'Antibiotic', form: 'Tablet', strength: '500mg' },
  { name: 'Levofloxacin', brand: 'Levomac / Levoflox', category: 'Antibiotic', form: 'Tablet', strength: '750mg' },
  { name: 'Cephalexin', brand: 'Sporidex', category: 'Antibiotic', form: 'Capsule', strength: '250mg' },
  { name: 'Cephalexin', brand: 'Sporidex', category: 'Antibiotic', form: 'Capsule', strength: '500mg' },
  { name: 'Cefuroxime', brand: 'Zinnat / Cefury', category: 'Antibiotic', form: 'Tablet', strength: '250mg' },
  { name: 'Cefuroxime', brand: 'Zinnat / Cefury', category: 'Antibiotic', form: 'Tablet', strength: '500mg' },
  { name: 'Cefixime', brand: 'Taxim-O / Suprax', category: 'Antibiotic', form: 'Tablet', strength: '200mg' },
  { name: 'Cefixime', brand: 'Taxim-O / Suprax', category: 'Antibiotic', form: 'Tablet', strength: '400mg' },
  { name: 'Cefpodoxime', brand: 'Cepodem', category: 'Antibiotic', form: 'Tablet', strength: '100mg' },
  { name: 'Cefpodoxime', brand: 'Cepodem', category: 'Antibiotic', form: 'Tablet', strength: '200mg' },
  { name: 'Doxycycline', brand: 'Doxt / Biodoxi', category: 'Antibiotic', form: 'Capsule', strength: '100mg' },
  { name: 'Metronidazole', brand: 'Flagyl / Metrogyl', category: 'Antibiotic', form: 'Tablet', strength: '200mg' },
  { name: 'Metronidazole', brand: 'Flagyl / Metrogyl', category: 'Antibiotic', form: 'Tablet', strength: '400mg' },
  { name: 'Tinidazole', brand: 'Tiniba / Fasigyn', category: 'Antibiotic', form: 'Tablet', strength: '500mg' },
  { name: 'Nitrofurantoin', brand: 'Furadantin / Macrobid', category: 'Antibiotic', form: 'Capsule', strength: '100mg' },
  { name: 'Cotrimoxazole', brand: 'Bactrim / Septran', category: 'Antibiotic', form: 'Tablet', strength: '480mg' },
  { name: 'Clindamycin', brand: 'Dalacin-C', category: 'Antibiotic', form: 'Capsule', strength: '150mg' },
  { name: 'Clindamycin', brand: 'Dalacin-C', category: 'Antibiotic', form: 'Capsule', strength: '300mg' },
  { name: 'Erythromycin', brand: 'Althrocin', category: 'Antibiotic', form: 'Tablet', strength: '250mg' },
  { name: 'Erythromycin', brand: 'Althrocin', category: 'Antibiotic', form: 'Tablet', strength: '500mg' },
  { name: 'Linezolid', brand: 'Linox / Zyvox', category: 'Antibiotic', form: 'Tablet', strength: '600mg' },
  { name: 'Rifampicin', brand: 'Rimactane / R-Cin', category: 'Antibiotic', form: 'Capsule', strength: '450mg' },
  { name: 'Rifampicin', brand: 'Rimactane / R-Cin', category: 'Antibiotic', form: 'Capsule', strength: '600mg' },
  { name: 'Isoniazid', brand: 'Isokin', category: 'Antibiotic', form: 'Tablet', strength: '300mg' },
  { name: 'Pyrazinamide', brand: 'Pyrazinamide', category: 'Antibiotic', form: 'Tablet', strength: '750mg' },
  { name: 'Ethambutol', brand: 'Myambutol', category: 'Antibiotic', form: 'Tablet', strength: '800mg' },

  // ── Antibiotics (Injection) ──
  { name: 'Ceftriaxone', brand: 'Monocef / Rocephin', category: 'Antibiotic (Injection)', form: 'Injection', strength: '1g' },
  { name: 'Ceftriaxone', brand: 'Monocef / Rocephin', category: 'Antibiotic (Injection)', form: 'Injection', strength: '2g' },
  { name: 'Cefazolin', brand: 'Reflin', category: 'Antibiotic (Injection)', form: 'Injection', strength: '1g' },
  { name: 'Cefuroxime', brand: 'Zinacef', category: 'Antibiotic (Injection)', form: 'Injection', strength: '750mg' },
  { name: 'Piperacillin + Tazobactam', brand: 'Piptaz / Zosyn', category: 'Antibiotic (Injection)', form: 'Injection', strength: '4.5g' },
  { name: 'Meropenem', brand: 'Meronem', category: 'Antibiotic (Injection)', form: 'Injection', strength: '1g' },
  { name: 'Imipenem + Cilastatin', brand: 'Tienam', category: 'Antibiotic (Injection)', form: 'Injection', strength: '500mg' },
  { name: 'Vancomycin', brand: 'Vancocin', category: 'Antibiotic (Injection)', form: 'Injection', strength: '500mg' },
  { name: 'Amikacin', brand: 'Amikin', category: 'Antibiotic (Injection)', form: 'Injection', strength: '250mg/ml' },
  { name: 'Gentamicin', brand: 'Garamycin', category: 'Antibiotic (Injection)', form: 'Injection', strength: '80mg/2ml' },
  { name: 'Metronidazole', brand: 'Metrogyl', category: 'Antibiotic (Injection)', form: 'Injection', strength: '500mg/100ml' },
  { name: 'Ciprofloxacin', brand: 'Ciplox', category: 'Antibiotic (Injection)', form: 'Injection', strength: '200mg/100ml' },
  { name: 'Levofloxacin', brand: 'Levoflox', category: 'Antibiotic (Injection)', form: 'Injection', strength: '500mg/100ml' },
  { name: 'Colistin', brand: 'Colistin', category: 'Antibiotic (Injection)', form: 'Injection', strength: '1MIU' },
  { name: 'Streptomycin', brand: 'Streptomycin', category: 'Antibiotic (Injection)', form: 'Injection', strength: '1g' },

  // ── Antifungals ──
  { name: 'Fluconazole', brand: 'Flucos / Forcan', category: 'Antifungal', form: 'Tablet', strength: '150mg' },
  { name: 'Fluconazole', brand: 'Flucos / Forcan', category: 'Antifungal', form: 'Capsule', strength: '50mg' },
  { name: 'Itraconazole', brand: 'Canditral / Itaspor', category: 'Antifungal', form: 'Capsule', strength: '100mg' },
  { name: 'Itraconazole', brand: 'Canditral / Itaspor', category: 'Antifungal', form: 'Capsule', strength: '200mg' },
  { name: 'Voriconazole', brand: 'Vfend', category: 'Antifungal', form: 'Tablet', strength: '200mg' },
  { name: 'Ketoconazole', brand: 'Nizoral', category: 'Antifungal', form: 'Tablet', strength: '200mg' },
  { name: 'Amphotericin B', brand: 'Fungizone', category: 'Antifungal', form: 'Injection', strength: '50mg' },
  { name: 'Clotrimazole', brand: 'Candid', category: 'Antifungal', form: 'Cream', strength: '1%' },
  { name: 'Nystatin', brand: 'Mycostatin', category: 'Antifungal', form: 'Oral Drops', strength: '100000IU/ml' },

  // ── Antidiabetics ──
  { name: 'Metformin', brand: 'Glycomet / Glucophage', category: 'Antidiabetic', form: 'Tablet', strength: '500mg' },
  { name: 'Metformin', brand: 'Glycomet / Glucophage', category: 'Antidiabetic', form: 'Tablet', strength: '850mg' },
  { name: 'Metformin SR', brand: 'Glycomet SR', category: 'Antidiabetic', form: 'Tablet', strength: '1000mg' },
  { name: 'Glimepiride', brand: 'Amaryl / Glimpid', category: 'Antidiabetic', form: 'Tablet', strength: '1mg' },
  { name: 'Glimepiride', brand: 'Amaryl / Glimpid', category: 'Antidiabetic', form: 'Tablet', strength: '2mg' },
  { name: 'Glimepiride', brand: 'Amaryl / Glimpid', category: 'Antidiabetic', form: 'Tablet', strength: '4mg' },
  { name: 'Glibenclamide', brand: 'Daonil', category: 'Antidiabetic', form: 'Tablet', strength: '5mg' },
  { name: 'Gliclazide MR', brand: 'Diamicron MR', category: 'Antidiabetic', form: 'Tablet', strength: '30mg' },
  { name: 'Gliclazide MR', brand: 'Diamicron MR', category: 'Antidiabetic', form: 'Tablet', strength: '60mg' },
  { name: 'Glipizide', brand: 'Minidiab', category: 'Antidiabetic', form: 'Tablet', strength: '5mg' },
  { name: 'Pioglitazone', brand: 'Pioz / Actos', category: 'Antidiabetic', form: 'Tablet', strength: '15mg' },
  { name: 'Pioglitazone', brand: 'Pioz / Actos', category: 'Antidiabetic', form: 'Tablet', strength: '30mg' },
  { name: 'Sitagliptin', brand: 'Januvia', category: 'Antidiabetic', form: 'Tablet', strength: '50mg' },
  { name: 'Sitagliptin', brand: 'Januvia', category: 'Antidiabetic', form: 'Tablet', strength: '100mg' },
  { name: 'Vildagliptin', brand: 'Galvus', category: 'Antidiabetic', form: 'Tablet', strength: '50mg' },
  { name: 'Teneligliptin', brand: 'Tendia / Ziten', category: 'Antidiabetic', form: 'Tablet', strength: '20mg' },
  { name: 'Dapagliflozin', brand: 'Forxiga', category: 'Antidiabetic', form: 'Tablet', strength: '10mg' },
  { name: 'Empagliflozin', brand: 'Jardiance', category: 'Antidiabetic', form: 'Tablet', strength: '10mg' },
  { name: 'Empagliflozin', brand: 'Jardiance', category: 'Antidiabetic', form: 'Tablet', strength: '25mg' },
  { name: 'Canagliflozin', brand: 'Invokana', category: 'Antidiabetic', form: 'Tablet', strength: '100mg' },
  { name: 'Acarbose', brand: 'Glucobay', category: 'Antidiabetic', form: 'Tablet', strength: '50mg' },
  { name: 'Insulin Regular', brand: 'Actrapid / Huminsulin R', category: 'Antidiabetic', form: 'Injection', strength: '100IU/ml' },
  { name: 'Insulin NPH (Isophane)', brand: 'Insulatard / Huminsulin N', category: 'Antidiabetic', form: 'Injection', strength: '100IU/ml' },
  { name: 'Insulin Glargine', brand: 'Lantus / Basalog', category: 'Antidiabetic', form: 'Injection', strength: '100IU/ml' },
  { name: 'Insulin Aspart', brand: 'Novorapid / Ryzodeg', category: 'Antidiabetic', form: 'Injection', strength: '100IU/ml' },
  { name: 'Insulin Lispro', brand: 'Humalog', category: 'Antidiabetic', form: 'Injection', strength: '100IU/ml' },
  { name: 'Insulin Premix 30/70', brand: 'Mixtard / Huminsulin 30/70', category: 'Antidiabetic', form: 'Injection', strength: '100IU/ml' },

  // ── Antihypertensives ──
  { name: 'Amlodipine', brand: 'Amlodac / Amlong / Amlopress', category: 'Antihypertensive', form: 'Tablet', strength: '5mg' },
  { name: 'Amlodipine', brand: 'Amlodac / Amlong', category: 'Antihypertensive', form: 'Tablet', strength: '10mg' },
  { name: 'Atenolol', brand: 'Tenormin / Aten', category: 'Antihypertensive', form: 'Tablet', strength: '25mg' },
  { name: 'Atenolol', brand: 'Tenormin / Aten', category: 'Antihypertensive', form: 'Tablet', strength: '50mg' },
  { name: 'Metoprolol', brand: 'Betaloc / Metolar', category: 'Antihypertensive', form: 'Tablet', strength: '25mg' },
  { name: 'Metoprolol SR', brand: 'Betaloc ZOK', category: 'Antihypertensive', form: 'Tablet', strength: '50mg' },
  { name: 'Bisoprolol', brand: 'Concor / Biselect', category: 'Antihypertensive', form: 'Tablet', strength: '2.5mg' },
  { name: 'Bisoprolol', brand: 'Concor / Biselect', category: 'Antihypertensive', form: 'Tablet', strength: '5mg' },
  { name: 'Bisoprolol', brand: 'Concor / Biselect', category: 'Antihypertensive', form: 'Tablet', strength: '10mg' },
  { name: 'Carvedilol', brand: 'Carloc / Carvil', category: 'Antihypertensive', form: 'Tablet', strength: '3.125mg' },
  { name: 'Carvedilol', brand: 'Carloc / Carvil', category: 'Antihypertensive', form: 'Tablet', strength: '6.25mg' },
  { name: 'Carvedilol', brand: 'Carloc / Carvil', category: 'Antihypertensive', form: 'Tablet', strength: '12.5mg' },
  { name: 'Enalapril', brand: 'Envas / Vasotec', category: 'Antihypertensive', form: 'Tablet', strength: '5mg' },
  { name: 'Enalapril', brand: 'Envas / Vasotec', category: 'Antihypertensive', form: 'Tablet', strength: '10mg' },
  { name: 'Lisinopril', brand: 'Listril / Zestril', category: 'Antihypertensive', form: 'Tablet', strength: '5mg' },
  { name: 'Lisinopril', brand: 'Listril / Zestril', category: 'Antihypertensive', form: 'Tablet', strength: '10mg' },
  { name: 'Ramipril', brand: 'Cardace / Ramace', category: 'Antihypertensive', form: 'Tablet', strength: '2.5mg' },
  { name: 'Ramipril', brand: 'Cardace / Ramace', category: 'Antihypertensive', form: 'Tablet', strength: '5mg' },
  { name: 'Ramipril', brand: 'Cardace / Ramace', category: 'Antihypertensive', form: 'Tablet', strength: '10mg' },
  { name: 'Telmisartan', brand: 'Telma / Telsartan', category: 'Antihypertensive', form: 'Tablet', strength: '20mg' },
  { name: 'Telmisartan', brand: 'Telma / Telsartan', category: 'Antihypertensive', form: 'Tablet', strength: '40mg' },
  { name: 'Telmisartan', brand: 'Telma / Telsartan', category: 'Antihypertensive', form: 'Tablet', strength: '80mg' },
  { name: 'Losartan', brand: 'Losar / Cozaar', category: 'Antihypertensive', form: 'Tablet', strength: '25mg' },
  { name: 'Losartan', brand: 'Losar / Cozaar', category: 'Antihypertensive', form: 'Tablet', strength: '50mg' },
  { name: 'Olmesartan', brand: 'Olmax / Benitec', category: 'Antihypertensive', form: 'Tablet', strength: '20mg' },
  { name: 'Olmesartan', brand: 'Olmax / Benitec', category: 'Antihypertensive', form: 'Tablet', strength: '40mg' },
  { name: 'Valsartan', brand: 'Valzaar / Diovan', category: 'Antihypertensive', form: 'Tablet', strength: '80mg' },
  { name: 'Valsartan', brand: 'Valzaar / Diovan', category: 'Antihypertensive', form: 'Tablet', strength: '160mg' },
  { name: 'Cilnidipine', brand: 'Cilacar', category: 'Antihypertensive', form: 'Tablet', strength: '5mg' },
  { name: 'Cilnidipine', brand: 'Cilacar', category: 'Antihypertensive', form: 'Tablet', strength: '10mg' },
  { name: 'Nifedipine SR', brand: 'Adalat', category: 'Antihypertensive', form: 'Tablet', strength: '20mg' },
  { name: 'Hydralazine', brand: 'Apresoline', category: 'Antihypertensive', form: 'Injection', strength: '20mg' },
  { name: 'Labetalol', brand: 'Labetalol', category: 'Antihypertensive', form: 'Tablet', strength: '100mg' },
  { name: 'Labetalol', brand: 'Labetalol', category: 'Antihypertensive', form: 'Injection', strength: '5mg/ml' },
  { name: 'Methyldopa', brand: 'Aldomet', category: 'Antihypertensive', form: 'Tablet', strength: '250mg' },
  { name: 'Clonidine', brand: 'Catapres', category: 'Antihypertensive', form: 'Tablet', strength: '100mcg' },
  { name: 'Prazosin', brand: 'Minipress', category: 'Antihypertensive', form: 'Tablet', strength: '1mg' },
  { name: 'Prazosin', brand: 'Minipress', category: 'Antihypertensive', form: 'Tablet', strength: '2mg' },

  // ── Cardiac ──
  { name: 'Clopidogrel', brand: 'Plavix / Deplatt', category: 'Cardiac', form: 'Tablet', strength: '75mg' },
  { name: 'Ticagrelor', brand: 'Brilinta', category: 'Cardiac', form: 'Tablet', strength: '60mg' },
  { name: 'Ticagrelor', brand: 'Brilinta', category: 'Cardiac', form: 'Tablet', strength: '90mg' },
  { name: 'Prasugrel', brand: 'Effient', category: 'Cardiac', form: 'Tablet', strength: '10mg' },
  { name: 'Warfarin', brand: 'Warf / Coumadin', category: 'Cardiac', form: 'Tablet', strength: '1mg' },
  { name: 'Warfarin', brand: 'Warf / Coumadin', category: 'Cardiac', form: 'Tablet', strength: '2mg' },
  { name: 'Warfarin', brand: 'Warf / Coumadin', category: 'Cardiac', form: 'Tablet', strength: '5mg' },
  { name: 'Rivaroxaban', brand: 'Xarelto', category: 'Cardiac', form: 'Tablet', strength: '10mg' },
  { name: 'Rivaroxaban', brand: 'Xarelto', category: 'Cardiac', form: 'Tablet', strength: '15mg' },
  { name: 'Rivaroxaban', brand: 'Xarelto', category: 'Cardiac', form: 'Tablet', strength: '20mg' },
  { name: 'Apixaban', brand: 'Eliquis', category: 'Cardiac', form: 'Tablet', strength: '2.5mg' },
  { name: 'Apixaban', brand: 'Eliquis', category: 'Cardiac', form: 'Tablet', strength: '5mg' },
  { name: 'Dabigatran', brand: 'Pradaxa', category: 'Cardiac', form: 'Capsule', strength: '110mg' },
  { name: 'Dabigatran', brand: 'Pradaxa', category: 'Cardiac', form: 'Capsule', strength: '150mg' },
  { name: 'Digoxin', brand: 'Lanoxin / Digoxin', category: 'Cardiac', form: 'Tablet', strength: '0.25mg' },
  { name: 'Amiodarone', brand: 'Cordarone / Tachyra', category: 'Cardiac', form: 'Tablet', strength: '100mg' },
  { name: 'Amiodarone', brand: 'Cordarone / Tachyra', category: 'Cardiac', form: 'Tablet', strength: '200mg' },
  { name: 'Amiodarone', brand: 'Cordarone', category: 'Cardiac', form: 'Injection', strength: '150mg/3ml' },
  { name: 'Isosorbide Dinitrate', brand: 'Isordil / Sorbitrate', category: 'Cardiac', form: 'Tablet', strength: '5mg' },
  { name: 'Isosorbide Mononitrate', brand: 'Ismo / Imdur', category: 'Cardiac', form: 'Tablet', strength: '20mg' },
  { name: 'Ivabradine', brand: 'Coralan / Ivabid', category: 'Cardiac', form: 'Tablet', strength: '5mg' },
  { name: 'Ivabradine', brand: 'Coralan / Ivabid', category: 'Cardiac', form: 'Tablet', strength: '7.5mg' },
  { name: 'Nitroglycerin', brand: 'Sorbitrate SL / Angised', category: 'Cardiac', form: 'Tablet (Sublingual)', strength: '0.5mg' },
  { name: 'Nitroglycerin', brand: 'Nitrostat', category: 'Cardiac', form: 'Injection', strength: '5mg/ml' },

  // ── Lipid Lowering ──
  { name: 'Atorvastatin', brand: 'Atorva / Lipitor', category: 'Lipid Lowering', form: 'Tablet', strength: '10mg' },
  { name: 'Atorvastatin', brand: 'Atorva / Lipitor', category: 'Lipid Lowering', form: 'Tablet', strength: '20mg' },
  { name: 'Atorvastatin', brand: 'Atorva / Lipitor', category: 'Lipid Lowering', form: 'Tablet', strength: '40mg' },
  { name: 'Atorvastatin', brand: 'Atorva / Lipitor', category: 'Lipid Lowering', form: 'Tablet', strength: '80mg' },
  { name: 'Rosuvastatin', brand: 'Crestor / Rozavel', category: 'Lipid Lowering', form: 'Tablet', strength: '5mg' },
  { name: 'Rosuvastatin', brand: 'Crestor / Rozavel', category: 'Lipid Lowering', form: 'Tablet', strength: '10mg' },
  { name: 'Rosuvastatin', brand: 'Crestor / Rozavel', category: 'Lipid Lowering', form: 'Tablet', strength: '20mg' },
  { name: 'Simvastatin', brand: 'Zocor', category: 'Lipid Lowering', form: 'Tablet', strength: '10mg' },
  { name: 'Simvastatin', brand: 'Zocor', category: 'Lipid Lowering', form: 'Tablet', strength: '20mg' },
  { name: 'Fenofibrate', brand: 'Tricor / Lipicard', category: 'Lipid Lowering', form: 'Tablet', strength: '145mg' },
  { name: 'Ezetimibe', brand: 'Ezetrol / Ezedoc', category: 'Lipid Lowering', form: 'Tablet', strength: '10mg' },

  // ── GI / Antiulcer ──
  { name: 'Pantoprazole', brand: 'Pan / Pantodac / Pantop', category: 'GI / Antiulcer', form: 'Tablet', strength: '20mg' },
  { name: 'Pantoprazole', brand: 'Pan / Pantodac / Pantop', category: 'GI / Antiulcer', form: 'Tablet', strength: '40mg' },
  { name: 'Pantoprazole', brand: 'Pantodac', category: 'GI / Antiulcer', form: 'Injection', strength: '40mg' },
  { name: 'Omeprazole', brand: 'Omez / Prilosec', category: 'GI / Antiulcer', form: 'Capsule', strength: '20mg' },
  { name: 'Rabeprazole', brand: 'Razo / Pariet', category: 'GI / Antiulcer', form: 'Tablet', strength: '20mg' },
  { name: 'Esomeprazole', brand: 'Neksium / Raciper', category: 'GI / Antiulcer', form: 'Tablet', strength: '20mg' },
  { name: 'Esomeprazole', brand: 'Neksium / Raciper', category: 'GI / Antiulcer', form: 'Tablet', strength: '40mg' },
  { name: 'Lansoprazole', brand: 'Lanzol', category: 'GI / Antiulcer', form: 'Capsule', strength: '30mg' },
  { name: 'Ranitidine', brand: 'Rantac / Zinetac', category: 'GI / Antiulcer', form: 'Tablet', strength: '150mg' },
  { name: 'Famotidine', brand: 'Famocid', category: 'GI / Antiulcer', form: 'Tablet', strength: '20mg' },
  { name: 'Antacid', brand: 'Gelusil / Digene / Mucaine', category: 'GI / Antiulcer', form: 'Suspension', strength: '10ml' },
  { name: 'Sucralfate', brand: 'Sucral / Carafate', category: 'GI / Antiulcer', form: 'Suspension', strength: '1g/5ml' },
  { name: 'Ursodeoxycholic Acid', brand: 'Udiliv / Ursocol', category: 'GI / Antiulcer', form: 'Tablet', strength: '300mg' },
  { name: 'Domperidone', brand: 'Domstal / Motilium', category: 'GI / Antiemetic', form: 'Tablet', strength: '10mg' },
  { name: 'Metoclopramide', brand: 'Perinorm / Maxolon', category: 'GI / Antiemetic', form: 'Tablet', strength: '10mg' },
  { name: 'Metoclopramide', brand: 'Perinorm', category: 'GI / Antiemetic', form: 'Injection', strength: '5mg/ml' },
  { name: 'Ondansetron', brand: 'Emeset / Zofran', category: 'GI / Antiemetic', form: 'Tablet', strength: '4mg' },
  { name: 'Ondansetron', brand: 'Emeset / Zofran', category: 'GI / Antiemetic', form: 'Injection', strength: '4mg/2ml' },
  { name: 'Ondansetron', brand: 'Emeset / Zofran', category: 'GI / Antiemetic', form: 'Injection', strength: '8mg/4ml' },
  { name: 'Granisetron', brand: 'Kytril', category: 'GI / Antiemetic', form: 'Injection', strength: '1mg/ml' },
  { name: 'Dicyclomine', brand: 'Cyclopam / Buscopan', category: 'GI / Antispasmodic', form: 'Tablet', strength: '10mg' },
  { name: 'Hyoscine Butylbromide', brand: 'Buscopan', category: 'GI / Antispasmodic', form: 'Injection', strength: '20mg/ml' },
  { name: 'Lactulose', brand: 'Duphalac', category: 'GI / Laxative', form: 'Syrup', strength: '10g/15ml' },
  { name: 'Bisacodyl', brand: 'Dulcolax', category: 'GI / Laxative', form: 'Tablet', strength: '5mg' },
  { name: 'Ispaghula Husk', brand: 'Isabgol / Sat Isabgol', category: 'GI / Laxative', form: 'Powder', strength: '3.4g/sachet' },
  { name: 'Oral Rehydration Salts', brand: 'Electral / ORS', category: 'GI / Laxative', form: 'Powder', strength: '21.5g/sachet' },

  // ── Diuretics ──
  { name: 'Furosemide', brand: 'Lasix / Frusemide', category: 'Diuretic', form: 'Tablet', strength: '20mg' },
  { name: 'Furosemide', brand: 'Lasix / Frusemide', category: 'Diuretic', form: 'Tablet', strength: '40mg' },
  { name: 'Furosemide', brand: 'Lasix', category: 'Diuretic', form: 'Injection', strength: '20mg/2ml' },
  { name: 'Torsemide', brand: 'Dytor', category: 'Diuretic', form: 'Tablet', strength: '10mg' },
  { name: 'Hydrochlorothiazide', brand: 'Hydrochlorothiazide', category: 'Diuretic', form: 'Tablet', strength: '12.5mg' },
  { name: 'Hydrochlorothiazide', brand: 'Hydrochlorothiazide', category: 'Diuretic', form: 'Tablet', strength: '25mg' },
  { name: 'Indapamide', brand: 'Lorvas / Natrilix', category: 'Diuretic', form: 'Tablet', strength: '2.5mg' },
  { name: 'Spironolactone', brand: 'Aldactone / Spiromide', category: 'Diuretic', form: 'Tablet', strength: '25mg' },
  { name: 'Spironolactone', brand: 'Aldactone / Spiromide', category: 'Diuretic', form: 'Tablet', strength: '100mg' },
  { name: 'Eplerenone', brand: 'Inspra', category: 'Diuretic', form: 'Tablet', strength: '25mg' },
  { name: 'Mannitol', brand: 'Mannitol', category: 'Diuretic', form: 'Injection', strength: '20%/100ml' },

  // ── Steroids ──
  { name: 'Dexamethasone', brand: 'Decadron / Dexona', category: 'Steroid', form: 'Tablet', strength: '0.5mg' },
  { name: 'Dexamethasone', brand: 'Decadron / Dexona', category: 'Steroid', form: 'Injection', strength: '4mg/ml' },
  { name: 'Dexamethasone', brand: 'Decadron', category: 'Steroid', form: 'Injection', strength: '8mg/2ml' },
  { name: 'Prednisolone', brand: 'Wysolone / Deltacortril', category: 'Steroid', form: 'Tablet', strength: '5mg' },
  { name: 'Prednisolone', brand: 'Wysolone / Deltacortril', category: 'Steroid', form: 'Tablet', strength: '10mg' },
  { name: 'Prednisolone', brand: 'Wysolone', category: 'Steroid', form: 'Tablet', strength: '20mg' },
  { name: 'Methylprednisolone', brand: 'Medrol / Solumedrol', category: 'Steroid', form: 'Tablet', strength: '4mg' },
  { name: 'Methylprednisolone', brand: 'Medrol / Solumedrol', category: 'Steroid', form: 'Tablet', strength: '16mg' },
  { name: 'Methylprednisolone', brand: 'Solumedrol', category: 'Steroid', form: 'Injection', strength: '40mg' },
  { name: 'Methylprednisolone', brand: 'Solumedrol', category: 'Steroid', form: 'Injection', strength: '125mg' },
  { name: 'Hydrocortisone', brand: 'Efcorlin / Solu-Cortef', category: 'Steroid', form: 'Injection', strength: '100mg' },
  { name: 'Betamethasone', brand: 'Betnesol / Celestone', category: 'Steroid', form: 'Injection', strength: '4mg/ml' },
  { name: 'Deflazacort', brand: 'Defcort', category: 'Steroid', form: 'Tablet', strength: '6mg' },

  // ── Anticoagulants ──
  { name: 'Heparin', brand: 'Heparin', category: 'Anticoagulant', form: 'Injection', strength: '5000IU/ml' },
  { name: 'Heparin', brand: 'Heparin', category: 'Anticoagulant', form: 'Injection', strength: '25000IU/5ml' },
  { name: 'Enoxaparin', brand: 'Clexane / Lovenox', category: 'Anticoagulant', form: 'Injection', strength: '40mg/0.4ml' },
  { name: 'Enoxaparin', brand: 'Clexane / Lovenox', category: 'Anticoagulant', form: 'Injection', strength: '60mg/0.6ml' },
  { name: 'Fondaparinux', brand: 'Arixtra', category: 'Anticoagulant', form: 'Injection', strength: '2.5mg/0.5ml' },
  { name: 'Tranexamic Acid', brand: 'Pause / Traxyl', category: 'Anticoagulant', form: 'Tablet', strength: '250mg' },
  { name: 'Tranexamic Acid', brand: 'Pause / Traxyl', category: 'Anticoagulant', form: 'Injection', strength: '500mg/5ml' },
  { name: 'Vitamin K1 (Phytonadione)', brand: 'Menadione / Mephyton', category: 'Anticoagulant', form: 'Injection', strength: '10mg/ml' },
  { name: 'Protamine Sulfate', brand: 'Protamine', category: 'Anticoagulant', form: 'Injection', strength: '10mg/ml' },

  // ── Respiratory ──
  { name: 'Salbutamol', brand: 'Asthalin / Ventolin', category: 'Respiratory', form: 'Tablet', strength: '4mg' },
  { name: 'Salbutamol', brand: 'Asthalin', category: 'Respiratory', form: 'Inhaler (MDI)', strength: '100mcg/puff' },
  { name: 'Salbutamol', brand: 'Asthalin', category: 'Respiratory', form: 'Injection', strength: '500mcg/ml' },
  { name: 'Levosalbutamol', brand: 'Levolin / Levolin', category: 'Respiratory', form: 'Inhaler (MDI)', strength: '50mcg/puff' },
  { name: 'Ipratropium', brand: 'Atrovent', category: 'Respiratory', form: 'Inhaler (MDI)', strength: '20mcg/puff' },
  { name: 'Tiotropium', brand: 'Spiriva', category: 'Respiratory', form: 'Inhaler (DPI)', strength: '18mcg/capsule' },
  { name: 'Formoterol + Budesonide', brand: 'Foracort', category: 'Respiratory', form: 'Inhaler (MDI)', strength: '6+200mcg/puff' },
  { name: 'Salmeterol + Fluticasone', brand: 'Seretide / Aerocort', category: 'Respiratory', form: 'Inhaler (MDI)', strength: '25+125mcg/puff' },
  { name: 'Montelukast', brand: 'Montair / Singulair', category: 'Respiratory', form: 'Tablet', strength: '10mg' },
  { name: 'Aminophylline', brand: 'Aminophylline', category: 'Respiratory', form: 'Injection', strength: '250mg/10ml' },
  { name: 'Theophylline SR', brand: 'Theo-Asthalin SR', category: 'Respiratory', form: 'Tablet', strength: '200mg' },
  { name: 'Dextromethorphan', brand: 'Benadryl / Corex-D', category: 'Respiratory', form: 'Syrup', strength: '10mg/5ml' },
  { name: 'Bromhexine', brand: 'Bisolvon', category: 'Respiratory', form: 'Tablet', strength: '8mg' },
  { name: 'Ambroxol', brand: 'Mucolite / Ambril', category: 'Respiratory', form: 'Tablet', strength: '30mg' },
  { name: 'Ambroxol', brand: 'Mucolite', category: 'Respiratory', form: 'Syrup', strength: '15mg/5ml' },
  { name: 'Budesonide', brand: 'Budecort / Pulmicort', category: 'Respiratory', form: 'Inhaler (MDI)', strength: '200mcg/puff' },
  { name: 'Fluticasone', brand: 'Flixotide / Flohale', category: 'Respiratory', form: 'Inhaler (MDI)', strength: '125mcg/puff' },

  // ── Vitamins & Minerals ──
  { name: 'Vitamin C', brand: 'Limcee / Celin', category: 'Vitamin & Mineral', form: 'Tablet', strength: '500mg' },
  { name: 'Vitamin B Complex', brand: 'Becosules / Nurokind', category: 'Vitamin & Mineral', form: 'Capsule', strength: '' },
  { name: 'Vitamin B12 (Methylcobalamin)', brand: 'Cobadex / Mecobalamin', category: 'Vitamin & Mineral', form: 'Tablet', strength: '500mcg' },
  { name: 'Vitamin B12', brand: 'Mecobalamin', category: 'Vitamin & Mineral', form: 'Injection', strength: '1000mcg/ml' },
  { name: 'Vitamin D3', brand: 'Uprise-D3 / Calcirol', category: 'Vitamin & Mineral', form: 'Capsule', strength: '60000IU' },
  { name: 'Vitamin D3', brand: 'Calcirol Sachet', category: 'Vitamin & Mineral', form: 'Sachet', strength: '60000IU' },
  { name: 'Calcium Carbonate', brand: 'Shelcal / Calcimax', category: 'Vitamin & Mineral', form: 'Tablet', strength: '500mg' },
  { name: 'Calcium + Vitamin D3', brand: 'Shelcal-HD / Calcimax-D3', category: 'Vitamin & Mineral', form: 'Tablet', strength: '500mg+250IU' },
  { name: 'Ferrous Sulfate', brand: 'Livogen / Autrin', category: 'Vitamin & Mineral', form: 'Tablet', strength: '150mg' },
  { name: 'Iron + Folic Acid', brand: 'Dexorange / Feronia XT', category: 'Vitamin & Mineral', form: 'Capsule', strength: '150mg+1.5mg' },
  { name: 'Folic Acid', brand: 'Folvite', category: 'Vitamin & Mineral', form: 'Tablet', strength: '5mg' },
  { name: 'Zinc Sulfate', brand: 'Zincovit', category: 'Vitamin & Mineral', form: 'Tablet', strength: '50mg' },
  { name: 'Multivitamin', brand: 'Supradyn / Becosules Z', category: 'Vitamin & Mineral', form: 'Tablet', strength: '' },
  { name: 'Omega-3 Fatty Acids', brand: 'Zofer / Nutri-Omega', category: 'Vitamin & Mineral', form: 'Capsule', strength: '1000mg' },
  { name: 'Alpha Lipoic Acid + Methylcobalamin', brand: 'Nervijen / Nervijen-OD', category: 'Vitamin & Mineral', form: 'Capsule', strength: '100mg+1500mcg' },
  { name: 'Thiamine (Vitamin B1)', brand: 'Benfotiamine / Thiamine', category: 'Vitamin & Mineral', form: 'Injection', strength: '100mg/ml' },
  { name: 'Vitamin K1', brand: 'Vitakay', category: 'Vitamin & Mineral', form: 'Injection', strength: '10mg/ml' },

  // ── Neurological / Anticonvulsant ──
  { name: 'Phenytoin', brand: 'Eptoin / Dilantin', category: 'Neurological', form: 'Tablet', strength: '50mg' },
  { name: 'Phenytoin', brand: 'Eptoin / Dilantin', category: 'Neurological', form: 'Tablet', strength: '100mg' },
  { name: 'Phenytoin', brand: 'Eptoin', category: 'Neurological', form: 'Injection', strength: '50mg/ml' },
  { name: 'Carbamazepine', brand: 'Tegretol / Mazetol', category: 'Neurological', form: 'Tablet', strength: '100mg' },
  { name: 'Carbamazepine', brand: 'Tegretol / Mazetol', category: 'Neurological', form: 'Tablet', strength: '200mg' },
  { name: 'Sodium Valproate / Valproic Acid', brand: 'Valparin / Epsolin', category: 'Neurological', form: 'Tablet', strength: '200mg' },
  { name: 'Sodium Valproate CR', brand: 'Valparin CR', category: 'Neurological', form: 'Tablet', strength: '500mg' },
  { name: 'Levetiracetam', brand: 'Levera / Keppra', category: 'Neurological', form: 'Tablet', strength: '250mg' },
  { name: 'Levetiracetam', brand: 'Levera / Keppra', category: 'Neurological', form: 'Tablet', strength: '500mg' },
  { name: 'Levetiracetam', brand: 'Levera', category: 'Neurological', form: 'Injection', strength: '500mg/5ml' },
  { name: 'Pregabalin', brand: 'Lyrica / Pregabalin', category: 'Neurological', form: 'Capsule', strength: '75mg' },
  { name: 'Pregabalin', brand: 'Lyrica / Pregabalin', category: 'Neurological', form: 'Capsule', strength: '150mg' },
  { name: 'Gabapentin', brand: 'Gabantin / Neurontin', category: 'Neurological', form: 'Capsule', strength: '100mg' },
  { name: 'Gabapentin', brand: 'Gabantin / Neurontin', category: 'Neurological', form: 'Capsule', strength: '300mg' },
  { name: 'Phenobarbitone', brand: 'Gardenal', category: 'Neurological', form: 'Tablet', strength: '60mg' },
  { name: 'Donepezil', brand: 'Aricept / Donecept', category: 'Neurological', form: 'Tablet', strength: '5mg' },
  { name: 'Donepezil', brand: 'Aricept / Donecept', category: 'Neurological', form: 'Tablet', strength: '10mg' },
  { name: 'Amitriptyline', brand: 'Elavil / Tryptomer', category: 'Neurological', form: 'Tablet', strength: '10mg' },
  { name: 'Amitriptyline', brand: 'Elavil / Tryptomer', category: 'Neurological', form: 'Tablet', strength: '25mg' },
  { name: 'Diazepam', brand: 'Calmpose / Valium', category: 'Neurological', form: 'Tablet', strength: '5mg' },
  { name: 'Diazepam', brand: 'Calmpose / Valium', category: 'Neurological', form: 'Injection', strength: '5mg/ml' },
  { name: 'Lorazepam', brand: 'Ativan', category: 'Neurological', form: 'Injection', strength: '2mg/ml' },
  { name: 'Clonazepam', brand: 'Clonotril / Rivotril', category: 'Neurological', form: 'Tablet', strength: '0.5mg' },
  { name: 'Clonazepam', brand: 'Clonotril / Rivotril', category: 'Neurological', form: 'Tablet', strength: '2mg' },
  { name: 'Midazolam', brand: 'Versed / Fulsed', category: 'Neurological', form: 'Injection', strength: '1mg/ml' },
  { name: 'Piracetam', brand: 'Nootropil / Piracetam', category: 'Neurological', form: 'Tablet', strength: '400mg' },
  { name: 'Piracetam', brand: 'Nootropil', category: 'Neurological', form: 'Injection', strength: '200mg/ml' },

  // ── Psychiatric ──
  { name: 'Haloperidol', brand: 'Serenace / Haldol', category: 'Psychiatric', form: 'Tablet', strength: '1.5mg' },
  { name: 'Haloperidol', brand: 'Serenace / Haldol', category: 'Psychiatric', form: 'Injection', strength: '5mg/ml' },
  { name: 'Risperidone', brand: 'Sizodon / Risperdal', category: 'Psychiatric', form: 'Tablet', strength: '1mg' },
  { name: 'Risperidone', brand: 'Sizodon / Risperdal', category: 'Psychiatric', form: 'Tablet', strength: '2mg' },
  { name: 'Olanzapine', brand: 'Oleanz / Zyprexa', category: 'Psychiatric', form: 'Tablet', strength: '5mg' },
  { name: 'Olanzapine', brand: 'Oleanz / Zyprexa', category: 'Psychiatric', form: 'Tablet', strength: '10mg' },
  { name: 'Quetiapine', brand: 'Seroquel / Qutipin', category: 'Psychiatric', form: 'Tablet', strength: '25mg' },
  { name: 'Quetiapine', brand: 'Seroquel / Qutipin', category: 'Psychiatric', form: 'Tablet', strength: '100mg' },
  { name: 'Fluoxetine', brand: 'Prodep / Prozac', category: 'Psychiatric', form: 'Capsule', strength: '20mg' },
  { name: 'Sertraline', brand: 'Zoloft / Serlift', category: 'Psychiatric', form: 'Tablet', strength: '50mg' },
  { name: 'Escitalopram', brand: 'Nexito / Stalopam', category: 'Psychiatric', form: 'Tablet', strength: '10mg' },
  { name: 'Escitalopram', brand: 'Nexito / Stalopam', category: 'Psychiatric', form: 'Tablet', strength: '20mg' },
  { name: 'Alprazolam', brand: 'Alprax / Xanax', category: 'Psychiatric', form: 'Tablet', strength: '0.25mg' },
  { name: 'Alprazolam', brand: 'Alprax / Xanax', category: 'Psychiatric', form: 'Tablet', strength: '0.5mg' },
  { name: 'Lithium Carbonate', brand: 'Lithosun / Licab', category: 'Psychiatric', form: 'Tablet', strength: '300mg' },

  // ── Thyroid ──
  { name: 'Levothyroxine', brand: 'Eltroxin / Thyronorm', category: 'Thyroid', form: 'Tablet', strength: '25mcg' },
  { name: 'Levothyroxine', brand: 'Eltroxin / Thyronorm', category: 'Thyroid', form: 'Tablet', strength: '50mcg' },
  { name: 'Levothyroxine', brand: 'Eltroxin / Thyronorm', category: 'Thyroid', form: 'Tablet', strength: '75mcg' },
  { name: 'Levothyroxine', brand: 'Eltroxin / Thyronorm', category: 'Thyroid', form: 'Tablet', strength: '100mcg' },
  { name: 'Carbimazole', brand: 'Neomercazole', category: 'Thyroid', form: 'Tablet', strength: '5mg' },
  { name: 'Carbimazole', brand: 'Neomercazole', category: 'Thyroid', form: 'Tablet', strength: '10mg' },
  { name: 'Propylthiouracil', brand: 'PTU', category: 'Thyroid', form: 'Tablet', strength: '50mg' },

  // ── Surgical / Anaesthesia ──
  { name: 'Neostigmine', brand: 'Neostigmine', category: 'Surgical / Anaesthesia', form: 'Injection', strength: '0.5mg/ml' },
  { name: 'Atropine', brand: 'Atropine', category: 'Surgical / Anaesthesia', form: 'Injection', strength: '0.6mg/ml' },
  { name: 'Fentanyl', brand: 'Fentanyl', category: 'Surgical / Anaesthesia', form: 'Injection', strength: '50mcg/ml' },
  { name: 'Bupivacaine', brand: 'Marcaine / Sensorcaine', category: 'Surgical / Anaesthesia', form: 'Injection', strength: '0.5%' },
  { name: 'Lignocaine (Lidocaine)', brand: 'Xylocaine', category: 'Surgical / Anaesthesia', form: 'Injection', strength: '2%' },
  { name: 'Ketamine', brand: 'Ketamine / Ketalar', category: 'Surgical / Anaesthesia', form: 'Injection', strength: '50mg/ml' },
  { name: 'Propofol', brand: 'Diprivan / Propovan', category: 'Surgical / Anaesthesia', form: 'Injection', strength: '10mg/ml' },
  { name: 'Suxamethonium (Succinylcholine)', brand: 'Scoline', category: 'Surgical / Anaesthesia', form: 'Injection', strength: '50mg/ml' },
  { name: 'Vecuronium', brand: 'Vecuronium', category: 'Surgical / Anaesthesia', form: 'Injection', strength: '10mg/vial' },
  { name: 'Rocuronium', brand: 'Esmeron / Rocuronium', category: 'Surgical / Anaesthesia', form: 'Injection', strength: '10mg/ml' },
  { name: 'Morphine', brand: 'Morphine', category: 'Surgical / Anaesthesia', form: 'Injection', strength: '10mg/ml' },

  // ── Post-op / Hospital Specifics ──
  { name: 'Paracetamol IV', brand: 'Perfalgan / Reapam', category: 'Post-op', form: 'Infusion', strength: '1g/100ml' },
  { name: 'Normal Saline', brand: 'NS 0.9%', category: 'Post-op', form: 'Infusion', strength: '100ml' },
  { name: 'Normal Saline', brand: 'NS 0.9%', category: 'Post-op', form: 'Infusion', strength: '500ml' },
  { name: 'Ringer Lactate', brand: 'RL / Hartmann\'s', category: 'Post-op', form: 'Infusion', strength: '500ml' },
  { name: 'Dextrose 5%', brand: 'DNS / D5W', category: 'Post-op', form: 'Infusion', strength: '500ml' },
  { name: 'Dextrose Saline', brand: 'DNS', category: 'Post-op', form: 'Infusion', strength: '500ml' },
  { name: 'Potassium Chloride', brand: 'KCl', category: 'Post-op', form: 'Injection', strength: '15%/10ml' },
  { name: 'Calcium Gluconate', brand: 'Calcium Gluconate', category: 'Post-op', form: 'Injection', strength: '10%/10ml' },
  { name: 'Magnesium Sulfate', brand: 'MgSO4', category: 'Post-op', form: 'Injection', strength: '50%/2ml' },
  { name: 'Adrenaline (Epinephrine)', brand: 'Epinephrine', category: 'Post-op', form: 'Injection', strength: '1mg/ml' },
  { name: 'Noradrenaline (Norepinephrine)', brand: 'Norepinephrine', category: 'Post-op', form: 'Injection', strength: '4mg/4ml' },
  { name: 'Dopamine', brand: 'Dopamine', category: 'Post-op', form: 'Injection', strength: '200mg/5ml' },
  { name: 'Dobutamine', brand: 'Dobutrex', category: 'Post-op', form: 'Injection', strength: '250mg/20ml' },
  { name: 'Vasopressin', brand: 'Vasopressin', category: 'Post-op', form: 'Injection', strength: '20IU/ml' },
  { name: 'Albumin', brand: 'Albuman / Buminate', category: 'Post-op', form: 'Infusion', strength: '20%/100ml' },

  // ── Topical / Wound Care ──
  { name: 'Povidone Iodine', brand: 'Betadine', category: 'Topical / Wound', form: 'Solution', strength: '10%' },
  { name: 'Povidone Iodine', brand: 'Betadine', category: 'Topical / Wound', form: 'Ointment', strength: '5%' },
  { name: 'Mupirocin', brand: 'Bactroban / T-Bact', category: 'Topical / Wound', form: 'Ointment', strength: '2%' },
  { name: 'Silver Sulfadiazine', brand: 'Silverex / Flamazine', category: 'Topical / Wound', form: 'Cream', strength: '1%' },
  { name: 'Fusidic Acid', brand: 'Fucidin', category: 'Topical / Wound', form: 'Cream', strength: '2%' },
  { name: 'Chlorhexidine Gluconate', brand: 'Savlon / Hibiscrub', category: 'Topical / Wound', form: 'Solution', strength: '4%' },
  { name: 'Framycetin', brand: 'Soframycin', category: 'Topical / Wound', form: 'Cream', strength: '1%' },
  { name: 'Neomycin + Polymyxin B', brand: 'Neosporin', category: 'Topical / Wound', form: 'Ointment', strength: '' },
];

// ─── Department Template Overrides ────────────────────────────────────────────

import type { SpecialtyFieldGroup, DepartmentTemplateOverride } from '../types';

function parseDeptTemplateRow(row: Record<string, unknown>): DepartmentTemplateOverride {
  return {
    id:          String(row.id),
    hospitalId:  String(row.hospital_id),
    specialty:   String(row.specialty),
    fieldGroups: Array.isArray(row.field_groups) ? (row.field_groups as SpecialtyFieldGroup[]) : [],
    updatedAt:   String(row.updated_at ?? ''),
  };
}

/** Fetch the department template override for a specific hospital + specialty. */
export async function fetchDepartmentTemplate(
  hospitalId: string,
  specialty: string,
): Promise<DepartmentTemplateOverride | null> {
  const { data, error } = await supabase
    .from('department_templates')
    .select('*')
    .eq('hospital_id', hospitalId)
    .eq('specialty', specialty)
    .maybeSingle();
  if (error) throw error;
  return data ? parseDeptTemplateRow(data as Record<string, unknown>) : null;
}

/** Upsert (insert or update) a department template override. */
export async function saveDepartmentTemplate(
  hospitalId: string,
  specialty: string,
  fieldGroups: SpecialtyFieldGroup[],
): Promise<DepartmentTemplateOverride> {
  const { data, error } = await supabase
    .from('department_templates')
    .upsert(
      { hospital_id: hospitalId, specialty, field_groups: fieldGroups, updated_at: new Date().toISOString() },
      { onConflict: 'hospital_id,specialty' },
    )
    .select()
    .single();
  if (error) throw error;
  return parseDeptTemplateRow(data as Record<string, unknown>);
}

/** Delete a department template override, reverting to the system default. */
export async function deleteDepartmentTemplate(hospitalId: string, specialty: string): Promise<void> {
  const { error } = await supabase
    .from('department_templates')
    .delete()
    .eq('hospital_id', hospitalId)
    .eq('specialty', specialty);
  if (error) throw error;
}
