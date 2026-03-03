/**
 * configService.ts
 * CRUD operations for ward_config and lab_type_config tables.
 * Both tables are read by all authenticated users; writes are admin-only (enforced in-app).
 */

import { supabase } from '../lib/supabase';
import { WardConfig, LabTypeConfig, HospitalConfig } from '../types';

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
