/**
 * specialtyTemplates.ts
 * Default clinical field templates for each medical specialty.
 * Each template defines which data groups and fields are shown in PatientDetail.
 * Hospitals can override these defaults via department_templates table.
 */

export type SpecialtyKey =
  | 'orthopaedics'
  | 'medicine'
  | 'cardiology'
  | 'neurology'
  | 'paediatrics'
  | 'general_surgery'
  | 'obg'
  | 'psychiatry'
  | 'ent'
  | 'ophthalmology'
  | 'urology'
  | 'neurosurgery'
  | 'pulmonology'
  | 'oncology';

export type SpecialtyFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'boolean'
  | 'score'
  | 'date'
  | 'multi_select';

export interface SpecialtyField {
  key: string;
  label: string;
  type: SpecialtyFieldType;
  options?: string[];
  min?: number;
  max?: number;
  unit?: string;
  placeholder?: string;
  required?: boolean;
}

export interface SpecialtyFieldGroup {
  key: string;
  label: string;
  icon?: string; // Lucide icon name
  fields: SpecialtyField[];
}

export interface SpecialtyTemplate {
  specialty: SpecialtyKey;
  displayName: string;
  /** Tailwind color prefix, e.g. 'blue', 'emerald', 'purple' */
  color: string;
  modules: {
    pac: boolean;
    otList: boolean;
    preOp: boolean;
    podTracking: boolean;
  };
  labels: {
    pacModule: string;
    procedureList: string;
  };
  fieldGroups: SpecialtyFieldGroup[];
}

// ─── All default templates ─────────────────────────────────────────────────────

const ORTHOPAEDICS: SpecialtyTemplate = {
  specialty: 'orthopaedics',
  displayName: 'Orthopaedics',
  color: 'blue',
  modules: { pac: true, otList: true, preOp: true, podTracking: true },
  labels: { pacModule: 'PAC Status', procedureList: 'OT List' },
  fieldGroups: [
    {
      key: 'surgical_details',
      label: 'Surgical Details',
      icon: 'Scissors',
      fields: [
        { key: 'implant_used', label: 'Implant Used', type: 'text', placeholder: 'e.g. DHS Nail, TKR System' },
        { key: 'fixation_type', label: 'Fixation Type', type: 'select', options: ['Nail', 'Plate & Screw', 'Arthroplasty', 'External Fixator', 'Arthroscopy', 'Fusion', 'Conservative'] },
        { key: 'bone_graft', label: 'Bone Graft Used', type: 'boolean' },
        { key: 'drain_output', label: 'Drain Output (mL/day)', type: 'number', unit: 'mL' },
        { key: 'cast_status', label: 'Cast / Splint Status', type: 'text', placeholder: 'e.g. Above knee POP, removed' },
      ],
    },
    {
      key: 'wound_assessment',
      label: 'Wound Assessment',
      icon: 'Stethoscope',
      fields: [
        { key: 'wound_condition', label: 'Wound Condition', type: 'select', options: ['Healthy', 'Mild Erythema', 'Infected', 'Dehisced', 'Necrotic', 'Healing well'] },
        { key: 'suture_staple', label: 'Closure Type', type: 'select', options: ['Sutures', 'Staples', 'Clips', 'Glue', 'Secondary healing'] },
        { key: 'suture_removal_date', label: 'Suture Removal Date', type: 'date' },
        { key: 'wound_notes', label: 'Wound Notes', type: 'textarea', placeholder: 'Any wound observations' },
      ],
    },
    {
      key: 'rehabilitation',
      label: 'Rehabilitation',
      icon: 'Activity',
      fields: [
        { key: 'weight_bearing', label: 'Weight Bearing Status', type: 'select', options: ['Non-weight bearing', 'Toe-touch weight bearing', 'Partial weight bearing', 'Weight bearing as tolerated', 'Full weight bearing'] },
        { key: 'physiotherapy', label: 'Physiotherapy Started', type: 'boolean' },
        { key: 'rom_notes', label: 'Range of Motion Notes', type: 'textarea', placeholder: 'e.g. Knee ROM 0-90°' },
        { key: 'discharge_plan', label: 'Discharge Mobility Plan', type: 'select', options: ['Walker', 'Crutches', 'Wheelchair', 'Walking stick', 'Independent'] },
      ],
    },
  ],
};

const MEDICINE: SpecialtyTemplate = {
  specialty: 'medicine',
  displayName: 'Internal Medicine',
  color: 'emerald',
  modules: { pac: false, otList: false, preOp: false, podTracking: false },
  labels: { pacModule: 'Pre-Admission', procedureList: 'Procedure List' },
  fieldGroups: [
    {
      key: 'clinical_assessment',
      label: 'Clinical Assessment',
      icon: 'Stethoscope',
      fields: [
        { key: 'general_condition', label: 'General Condition', type: 'select', options: ['Good', 'Fair', 'Poor', 'Critical', 'Improving', 'Deteriorating'] },
        { key: 'fever_status', label: 'Fever Status', type: 'select', options: ['Afebrile', 'Febrile (<38.5°C)', 'High grade fever (>38.5°C)', 'Defervescing'] },
        { key: 'o2_requirement', label: 'O₂ Requirement (L/min)', type: 'number', min: 0, max: 15, unit: 'L/min', placeholder: '0 = Room air' },
        { key: 'spo2_on_o2', label: 'SpO₂ on O₂ (%)', type: 'number', min: 70, max: 100, unit: '%' },
        { key: 'fluid_balance', label: 'Fluid Balance (mL/24h)', type: 'text', placeholder: 'e.g. +500, -200' },
      ],
    },
    {
      key: 'problem_list',
      label: 'Active Problem List',
      icon: 'ClipboardList',
      fields: [
        { key: 'active_problems', label: 'Active Problems', type: 'textarea', placeholder: '1. Diabetic ketoacidosis\n2. AKI on CKD\n3. Hypertensive emergency' },
        { key: 'hba1c', label: 'HbA1c (%)', type: 'number', min: 4, max: 15, unit: '%' },
        { key: 'ckd_stage', label: 'CKD Stage', type: 'select', options: ['None', 'Stage 1', 'Stage 2', 'Stage 3a', 'Stage 3b', 'Stage 4', 'Stage 5', 'On dialysis'] },
        { key: 'iv_access', label: 'IV Access Site', type: 'text', placeholder: 'e.g. Right forearm PIVC, PICC line' },
      ],
    },
    {
      key: 'infection_control',
      label: 'Infection Management',
      icon: 'ShieldAlert',
      fields: [
        { key: 'culture_sent', label: 'Culture / Sensitivity Sent', type: 'boolean' },
        { key: 'culture_site', label: 'Culture Site', type: 'text', placeholder: 'e.g. Blood, Urine, Sputum' },
        { key: 'antibiotic_started', label: 'Antibiotic Started On', type: 'date' },
        { key: 'antibiotic_de_escalation', label: 'De-escalation Plan', type: 'textarea', placeholder: 'e.g. Switch to oral after 48h afebrile' },
      ],
    },
    {
      key: 'clinical_scores',
      label: 'Clinical Scores',
      icon: 'BarChart2',
      fields: [
        { key: 'curb65', label: 'CURB-65 Score', type: 'score', min: 0, max: 5 },
        { key: 'news2', label: 'NEWS2 Score', type: 'score', min: 0, max: 20 },
        { key: 'meld_score', label: 'MELD Score (if liver)', type: 'number', min: 6, max: 40 },
      ],
    },
  ],
};

const CARDIOLOGY: SpecialtyTemplate = {
  specialty: 'cardiology',
  displayName: 'Cardiology',
  color: 'red',
  modules: { pac: false, otList: true, preOp: false, podTracking: false },
  labels: { pacModule: 'Pre-Cath Clearance', procedureList: 'Procedure List' },
  fieldGroups: [
    {
      key: 'cardiac_status',
      label: 'Cardiac Status',
      icon: 'Heart',
      fields: [
        { key: 'nyha_class', label: 'NYHA Class', type: 'select', options: ['I – No symptoms', 'II – Symptoms on exertion', 'III – Symptoms on mild exertion', 'IV – Symptoms at rest'] },
        { key: 'ejection_fraction', label: 'Ejection Fraction (%)', type: 'number', min: 10, max: 80, unit: '%' },
        { key: 'cardiac_rhythm', label: 'Cardiac Rhythm', type: 'select', options: ['Normal sinus rhythm', 'Sinus tachycardia', 'Sinus bradycardia', 'Atrial fibrillation', 'Atrial flutter', 'LBBB', 'RBBB', 'Heart block 1°', 'Heart block 2°', 'Complete heart block', 'VT', 'Paced rhythm'] },
        { key: 'dyspnoea', label: 'Dyspnoea', type: 'boolean' },
        { key: 'chest_pain', label: 'Chest Pain', type: 'boolean' },
        { key: 'pnd_orthopnoea', label: 'PND / Orthopnoea', type: 'boolean' },
        { key: 'pedal_oedema', label: 'Pedal Oedema', type: 'select', options: ['None', 'Mild (+)', 'Moderate (++)', 'Severe (+++)'] },
      ],
    },
    {
      key: 'biomarkers',
      label: 'Cardiac Biomarkers',
      icon: 'TestTube',
      fields: [
        { key: 'troponin', label: 'Troponin (ng/mL)', type: 'number', unit: 'ng/mL' },
        { key: 'bnp_or_nt_probnp', label: 'BNP / NT-proBNP (pg/mL)', type: 'number', unit: 'pg/mL' },
        { key: 'ckmb', label: 'CK-MB (ng/mL)', type: 'number', unit: 'ng/mL' },
        { key: 'inr', label: 'INR (if on warfarin)', type: 'number', unit: '' },
      ],
    },
    {
      key: 'echo_cath',
      label: 'Echo & Cath Findings',
      icon: 'FileText',
      fields: [
        { key: 'last_echo_date', label: 'Last Echo Date', type: 'date' },
        { key: 'echo_findings', label: 'Echo Findings', type: 'textarea', placeholder: 'e.g. Dilated LV, EF 30%, Moderate MR, No pericardial effusion' },
        { key: 'last_cath_date', label: 'Last Cath Date', type: 'date' },
        { key: 'cath_findings', label: 'Catheterization Findings', type: 'textarea', placeholder: 'e.g. 3-vessel disease, LAD 90% stenosis' },
        { key: 'stent_details', label: 'Stent / CABG Details', type: 'text', placeholder: 'e.g. 2 DES to LAD & RCA 2023' },
      ],
    },
    {
      key: 'devices',
      label: 'Cardiac Devices',
      icon: 'Zap',
      fields: [
        { key: 'pacemaker', label: 'Pacemaker', type: 'boolean' },
        { key: 'icd', label: 'ICD (Implantable Defibrillator)', type: 'boolean' },
        { key: 'crt', label: 'CRT Device', type: 'boolean' },
        { key: 'device_details', label: 'Device Details', type: 'text', placeholder: 'e.g. VVI PPM — single chamber, battery 40%' },
      ],
    },
  ],
};

const NEUROLOGY: SpecialtyTemplate = {
  specialty: 'neurology',
  displayName: 'Neurology',
  color: 'violet',
  modules: { pac: false, otList: false, preOp: false, podTracking: false },
  labels: { pacModule: 'Pre-Procedure', procedureList: 'Procedure List' },
  fieldGroups: [
    {
      key: 'consciousness',
      label: 'Consciousness & GCS',
      icon: 'Brain',
      fields: [
        { key: 'gcs_eye', label: 'GCS – Eyes (E)', type: 'score', min: 1, max: 4 },
        { key: 'gcs_verbal', label: 'GCS – Verbal (V)', type: 'score', min: 1, max: 5 },
        { key: 'gcs_motor', label: 'GCS – Motor (M)', type: 'score', min: 1, max: 6 },
        { key: 'loc', label: 'Level of Consciousness', type: 'select', options: ['Alert', 'Drowsy', 'Confused', 'Stuporous', 'Comatose'] },
        { key: 'orientation', label: 'Orientation', type: 'select', options: ['Oriented T+P+Place', 'Disoriented to Time', 'Disoriented to Time+Place', 'Fully disoriented'] },
      ],
    },
    {
      key: 'motor_exam',
      label: 'Motor Examination',
      icon: 'Activity',
      fields: [
        { key: 'power_rul', label: 'Power – Right Upper Limb (0–5)', type: 'score', min: 0, max: 5 },
        { key: 'power_lul', label: 'Power – Left Upper Limb (0–5)', type: 'score', min: 0, max: 5 },
        { key: 'power_rll', label: 'Power – Right Lower Limb (0–5)', type: 'score', min: 0, max: 5 },
        { key: 'power_lll', label: 'Power – Left Lower Limb (0–5)', type: 'score', min: 0, max: 5 },
        { key: 'tone', label: 'Tone', type: 'select', options: ['Normal', 'Hypotonia', 'Spasticity', 'Rigidity', 'Mixed'] },
        { key: 'reflexes', label: 'Deep Tendon Reflexes', type: 'select', options: ['Normal', 'Hyperreflexia', 'Hyporeflexia', 'Absent', 'Mixed'] },
        { key: 'plantar', label: 'Plantar Response', type: 'select', options: ['Bilateral flexor', 'Right extensor (Babinski+)', 'Left extensor (Babinski+)', 'Bilateral extensor'] },
      ],
    },
    {
      key: 'clinical_scores',
      label: 'Clinical Scores',
      icon: 'BarChart2',
      fields: [
        { key: 'nihss', label: 'NIHSS Score', type: 'score', min: 0, max: 42 },
        { key: 'stroke_type', label: 'Stroke Type', type: 'select', options: ['Ischaemic – large vessel', 'Ischaemic – small vessel', 'Haemorrhagic', 'SAH', 'TIA', 'Not applicable'] },
        { key: 'thrombolysis', label: 'Thrombolysis Given', type: 'boolean' },
        { key: 'thrombolysis_time', label: 'Thrombolysis Time (door-to-needle)', type: 'text', placeholder: 'e.g. 45 min' },
      ],
    },
    {
      key: 'seizure',
      label: 'Seizure Management',
      icon: 'Zap',
      fields: [
        { key: 'seizure_type', label: 'Seizure Type', type: 'select', options: ['None', 'GTCS', 'Focal aware', 'Focal impaired', 'Absence', 'Status epilepticus', 'PNES'] },
        { key: 'last_seizure', label: 'Last Seizure Date/Time', type: 'text', placeholder: 'e.g. 12 Mar 2026 10:30' },
        { key: 'seizure_frequency', label: 'Seizure Frequency', type: 'text', placeholder: 'e.g. 2 per day, free for 3 days' },
        { key: 'current_aed', label: 'Current AED', type: 'textarea', placeholder: 'e.g. Levetiracetam 1g BD, Valproate 500mg BD' },
      ],
    },
  ],
};

const PAEDIATRICS: SpecialtyTemplate = {
  specialty: 'paediatrics',
  displayName: 'Paediatrics',
  color: 'pink',
  modules: { pac: false, otList: false, preOp: false, podTracking: false },
  labels: { pacModule: 'Pre-Procedure', procedureList: 'Procedure List' },
  fieldGroups: [
    {
      key: 'child_demographics',
      label: 'Child & Family Details',
      icon: 'Users',
      fields: [
        { key: 'age_months', label: 'Age in Months', type: 'number', min: 0, max: 216, unit: 'months' },
        { key: 'mother_name', label: "Mother's Name", type: 'text' },
        { key: 'mother_contact', label: "Mother's Contact", type: 'text' },
        { key: 'father_name', label: "Father's Name", type: 'text' },
        { key: 'birth_order', label: 'Birth Order', type: 'text', placeholder: 'e.g. 2nd of 3 children' },
      ],
    },
    {
      key: 'growth',
      label: 'Growth & Anthropometry',
      icon: 'TrendingUp',
      fields: [
        { key: 'weight_kg', label: 'Weight (kg)', type: 'number', unit: 'kg' },
        { key: 'height_cm', label: 'Height / Length (cm)', type: 'number', unit: 'cm' },
        { key: 'hc_cm', label: 'Head Circumference (cm)', type: 'number', unit: 'cm' },
        { key: 'weight_percentile', label: 'Weight-for-Age Percentile', type: 'select', options: ['<3rd (Severely underweight)', '3rd–15th (Underweight)', '15th–85th (Normal)', '85th–97th (Overweight)', '>97th (Obese)'] },
        { key: 'nutrition_status', label: 'Nutritional Status', type: 'select', options: ['Well-nourished', 'Mildly malnourished', 'Moderately malnourished (SAM)', 'Severely malnourished (SAM)'] },
      ],
    },
    {
      key: 'feeding',
      label: 'Feeding & Nutrition',
      icon: 'Droplet',
      fields: [
        { key: 'feeding_type', label: 'Feeding Type', type: 'select', options: ['Exclusive breastfeeding', 'Mixed feeding', 'Formula', 'Weaning diet', 'NG tube feeds', 'OG tube feeds', 'TPN', 'NPO'] },
        { key: 'feeds_per_day', label: 'Feeds per Day', type: 'number', min: 0, max: 20 },
        { key: 'volume_per_feed', label: 'Volume per Feed (mL)', type: 'number', unit: 'mL' },
      ],
    },
    {
      key: 'immunisation',
      label: 'Immunisation Status',
      icon: 'Shield',
      fields: [
        { key: 'immunisation_status', label: 'Overall Status', type: 'select', options: ['Up to date', 'Partially immunised', 'Not immunised', 'Unknown'] },
        { key: 'pending_vaccines', label: 'Vaccines Pending', type: 'textarea', placeholder: 'e.g. MMR (due at 9 months), DPT booster' },
        { key: 'vitamin_a', label: 'Vitamin A Given', type: 'boolean' },
      ],
    },
    {
      key: 'development',
      label: 'Developmental Milestones',
      icon: 'Star',
      fields: [
        { key: 'milestone_status', label: 'Overall Milestone Status', type: 'select', options: ['Age-appropriate', 'Mildly delayed', 'Moderately delayed', 'Severely delayed', 'Regression noted'] },
        { key: 'milestone_notes', label: 'Milestone Notes', type: 'textarea', placeholder: 'e.g. Not yet sitting at 9 months, social smile present' },
      ],
    },
    {
      key: 'neonatal',
      label: 'Neonatal Details (if age < 28 days)',
      icon: 'Baby',
      fields: [
        { key: 'gestational_age', label: 'Gestational Age at Birth (weeks)', type: 'number', min: 24, max: 44, unit: 'weeks' },
        { key: 'birth_weight', label: 'Birth Weight (kg)', type: 'number', unit: 'kg' },
        { key: 'apgar_1min', label: 'APGAR Score at 1 min', type: 'score', min: 0, max: 10 },
        { key: 'apgar_5min', label: 'APGAR Score at 5 min', type: 'score', min: 0, max: 10 },
        { key: 'nicu_stay', label: 'NICU Stay', type: 'boolean' },
        { key: 'nicu_reason', label: 'NICU Reason', type: 'text', placeholder: 'e.g. Prematurity, birth asphyxia' },
      ],
    },
  ],
};

const GENERAL_SURGERY: SpecialtyTemplate = {
  specialty: 'general_surgery',
  displayName: 'General Surgery',
  color: 'orange',
  modules: { pac: true, otList: true, preOp: true, podTracking: true },
  labels: { pacModule: 'PAC Status', procedureList: 'OT List' },
  fieldGroups: [
    {
      key: 'post_op_status',
      label: 'Post-operative Status',
      icon: 'Scissors',
      fields: [
        { key: 'wound_class', label: 'Wound Classification', type: 'select', options: ['Clean (Class I)', 'Clean-Contaminated (Class II)', 'Contaminated (Class III)', 'Dirty (Class IV)'] },
        { key: 'drain_1_output', label: 'Drain 1 Output (mL/day)', type: 'number', unit: 'mL' },
        { key: 'drain_1_character', label: 'Drain 1 Character', type: 'select', options: ['Serous', 'Serosanguinous', 'Haemorrhagic', 'Bilious', 'Faecal', 'Nil'] },
        { key: 'drain_2_output', label: 'Drain 2 Output (mL/day)', type: 'number', unit: 'mL' },
        { key: 'stoma_present', label: 'Stoma Present', type: 'boolean' },
        { key: 'stoma_type', label: 'Stoma Type', type: 'select', options: ['Colostomy', 'Ileostomy', 'Urostomy', 'Not applicable'] },
        { key: 'stoma_output', label: 'Stoma Output (mL/day)', type: 'number', unit: 'mL' },
      ],
    },
    {
      key: 'wound_management',
      label: 'Wound Management',
      icon: 'Bandage',
      fields: [
        { key: 'wound_condition', label: 'Wound Condition', type: 'select', options: ['Healthy', 'Mild erythema', 'Infected', 'Dehisced', 'Necrotic', 'Healing by secondary intention'] },
        { key: 'wound_notes', label: 'Wound Notes', type: 'textarea', placeholder: 'Describe wound appearance, size, exudate' },
        { key: 'suture_removal_date', label: 'Suture Removal Date', type: 'date' },
      ],
    },
    {
      key: 'nutrition',
      label: 'Nutrition & Diet',
      icon: 'UtensilsCrossed',
      fields: [
        { key: 'oral_intake', label: 'Oral Intake', type: 'select', options: ['Nil by mouth (NPO)', 'Sips of water', 'Clear liquids', 'Full liquids', 'Soft diet', 'Normal diet'] },
        { key: 'tpn', label: 'On TPN / Parenteral Nutrition', type: 'boolean' },
        { key: 'ng_tube', label: 'Nasogastric Tube In-situ', type: 'boolean' },
      ],
    },
  ],
};

const OBG: SpecialtyTemplate = {
  specialty: 'obg',
  displayName: 'Obstetrics & Gynaecology',
  color: 'rose',
  modules: { pac: true, otList: true, preOp: true, podTracking: true },
  labels: { pacModule: 'Pre-op Clearance', procedureList: 'OT List' },
  fieldGroups: [
    {
      key: 'obstetric_history',
      label: 'Obstetric History (GPAL)',
      icon: 'Users',
      fields: [
        { key: 'gravida', label: 'Gravida (G)', type: 'number', min: 0, max: 20 },
        { key: 'para', label: 'Para (P)', type: 'number', min: 0, max: 20 },
        { key: 'abortions', label: 'Abortions (A)', type: 'number', min: 0, max: 20 },
        { key: 'living', label: 'Living (L)', type: 'number', min: 0, max: 20 },
        { key: 'prev_lscs', label: 'Previous LSCS / Scar Uterus', type: 'boolean' },
        { key: 'lscs_count', label: 'Number of Previous LSCS', type: 'number', min: 0, max: 10 },
      ],
    },
    {
      key: 'current_pregnancy',
      label: 'Current Pregnancy',
      icon: 'Calendar',
      fields: [
        { key: 'lmp', label: 'Last Menstrual Period (LMP)', type: 'date' },
        { key: 'edd', label: 'Expected Date of Delivery (EDD)', type: 'date' },
        { key: 'gestational_age_weeks', label: 'Gestational Age (weeks)', type: 'number', min: 4, max: 44, unit: 'weeks' },
        { key: 'gestational_age_days', label: 'Gestational Age (days)', type: 'number', min: 0, max: 6, unit: 'days' },
        { key: 'mode_of_conception', label: 'Mode of Conception', type: 'select', options: ['Spontaneous', 'IVF', 'IUI', 'ICSI'] },
        { key: 'antenatal_care', label: 'Antenatal Care', type: 'select', options: ['Regular (Govt)', 'Regular (Private)', 'Irregular', 'No ANC'] },
      ],
    },
    {
      key: 'fetal_status',
      label: 'Fetal Status',
      icon: 'Heart',
      fields: [
        { key: 'fhr', label: 'Fetal Heart Rate (bpm)', type: 'number', min: 80, max: 200, unit: 'bpm' },
        { key: 'fetal_presentation', label: 'Fetal Presentation', type: 'select', options: ['Cephalic', 'Breech', 'Transverse', 'Oblique', 'Not assessed'] },
        { key: 'fetal_movements', label: 'Fetal Movements', type: 'select', options: ['Good', 'Reduced', 'Absent'] },
        { key: 'fundal_height', label: 'Fundal Height (weeks/cm)', type: 'text', placeholder: 'e.g. 36 weeks / 36 cm' },
        { key: 'usg_findings', label: 'USG / Growth Scan Findings', type: 'textarea', placeholder: 'e.g. Single live foetus, GA 36+2, EFW 2.8kg, AFI 12' },
      ],
    },
    {
      key: 'antenatal_monitoring',
      label: 'Antenatal Monitoring',
      icon: 'Activity',
      fields: [
        { key: 'bp_trend', label: 'BP Trend', type: 'select', options: ['Normotensive', 'Mild hypertension', 'Severe hypertension', 'Pre-eclampsia', 'Eclampsia', 'Improving'] },
        { key: 'urine_protein', label: 'Urine Protein (dipstick)', type: 'select', options: ['Nil', 'Trace', '+', '++', '+++'] },
        { key: 'gdm_status', label: 'Gestational Diabetes', type: 'select', options: ['No GDM', 'GDM on diet control', 'GDM on insulin', 'Pre-existing DM'] },
        { key: 'ctg_findings', label: 'CTG Findings', type: 'select', options: ['Reassuring', 'Non-reassuring', 'Pathological', 'Not done'] },
      ],
    },
  ],
};

const PSYCHIATRY: SpecialtyTemplate = {
  specialty: 'psychiatry',
  displayName: 'Psychiatry',
  color: 'indigo',
  modules: { pac: false, otList: false, preOp: false, podTracking: false },
  labels: { pacModule: 'Pre-ECT Assessment', procedureList: 'Procedure List' },
  fieldGroups: [
    {
      key: 'mse_appearance',
      label: 'Mental Status Exam — Appearance & Behaviour',
      icon: 'User',
      fields: [
        { key: 'appearance', label: 'Appearance & Grooming', type: 'select', options: ['Well-groomed', 'Casually dressed', 'Unkempt', 'Dishevelled', 'Inappropriate dress'] },
        { key: 'psychomotor', label: 'Psychomotor Activity', type: 'select', options: ['Normal', 'Retarded', 'Agitated', 'Catatonic', 'Waxy flexibility'] },
        { key: 'eye_contact', label: 'Eye Contact', type: 'select', options: ['Good', 'Poor', 'Avoidant', 'Intense / Staring'] },
        { key: 'rapport', label: 'Rapport', type: 'select', options: ['Good', 'Fair', 'Poor', 'Unable to establish'] },
      ],
    },
    {
      key: 'mse_mood_thought',
      label: 'Mental Status Exam — Mood, Thought & Perception',
      icon: 'Brain',
      fields: [
        { key: 'mood_subjective', label: 'Mood (Subjective — patient says)', type: 'text', placeholder: "e.g. 'I feel very low'" },
        { key: 'affect', label: 'Affect (Objective)', type: 'select', options: ['Euthymic', 'Dysphoric / Depressed', 'Euphoric / Elevated', 'Anxious', 'Irritable', 'Labile', 'Blunted', 'Flat'] },
        { key: 'thought_form', label: 'Thought Form', type: 'select', options: ['Coherent', 'Loosened associations', 'Tangential', 'Circumstantial', 'Flight of ideas', 'Thought block', 'Neologisms', 'Perseveration'] },
        { key: 'delusions', label: 'Delusions', type: 'text', placeholder: 'Type if present, e.g. Persecutory, Grandiose, Nihilistic' },
        { key: 'hallucinations', label: 'Hallucinations', type: 'select', options: ['None', 'Auditory (non-threatening)', 'Auditory (command)', 'Visual', 'Tactile', 'Olfactory', 'Multiple modalities'] },
        { key: 'insight', label: 'Insight', type: 'select', options: ['Full insight', 'Partial insight', 'No insight'] },
        { key: 'judgment', label: 'Judgment', type: 'select', options: ['Intact', 'Impaired'] },
      ],
    },
    {
      key: 'risk_assessment',
      label: 'Risk Assessment',
      icon: 'AlertTriangle',
      fields: [
        { key: 'suicidal_ideation', label: 'Suicidal Ideation', type: 'select', options: ['None', 'Passive (wish to die)', 'Active (vague)', 'Active with plan', 'Active with plan + intent'] },
        { key: 'homicidal_ideation', label: 'Homicidal Ideation', type: 'select', options: ['None', 'Vague', 'With plan'] },
        { key: 'self_harm', label: 'Self-Harm Behaviour', type: 'select', options: ['None', 'Non-suicidal self-injury', 'Suicide attempt this admission'] },
        { key: 'risk_level', label: 'Overall Risk Level', type: 'select', options: ['Low', 'Moderate', 'High', 'Imminent'] },
        { key: 'protective_factors', label: 'Protective Factors', type: 'textarea', placeholder: 'e.g. Family support, religious beliefs, future plans' },
      ],
    },
    {
      key: 'medication_monitoring',
      label: 'Psychiatric Medication Monitoring',
      icon: 'Pill',
      fields: [
        { key: 'current_psych_meds', label: 'Current Medications', type: 'textarea', placeholder: 'e.g. Olanzapine 10mg ON, Lithium 400mg BD' },
        { key: 'lithium_level', label: 'Lithium Level (mEq/L)', type: 'number', unit: 'mEq/L' },
        { key: 'valproate_level', label: 'Valproate Level (mg/L)', type: 'number', unit: 'mg/L' },
        { key: 'clozapine_level', label: 'Clozapine Level (ng/mL)', type: 'number', unit: 'ng/mL' },
        { key: 'compliance', label: 'Medication Compliance', type: 'select', options: ['Good', 'Partial', 'Non-compliant', 'Unable to assess'] },
      ],
    },
  ],
};

const ENT: SpecialtyTemplate = {
  specialty: 'ent',
  displayName: 'ENT',
  color: 'teal',
  modules: { pac: true, otList: true, preOp: true, podTracking: true },
  labels: { pacModule: 'PAC Status', procedureList: 'OT List' },
  fieldGroups: [
    {
      key: 'ear_assessment',
      label: 'Ear Assessment',
      icon: 'Ear',
      fields: [
        { key: 'right_ear', label: 'Right Ear (Otoscopy)', type: 'textarea', placeholder: 'e.g. TM perforated central, discharge present' },
        { key: 'left_ear', label: 'Left Ear (Otoscopy)', type: 'textarea', placeholder: 'e.g. TM intact, cone of light present' },
        { key: 'hearing_loss', label: 'Hearing Loss', type: 'select', options: ['None', 'Mild CHL', 'Moderate CHL', 'Severe CHL', 'Profound CHL', 'SNHL', 'Mixed'] },
        { key: 'pta_right', label: 'PTA Right (dBHL)', type: 'number', unit: 'dBHL' },
        { key: 'pta_left', label: 'PTA Left (dBHL)', type: 'number', unit: 'dBHL' },
        { key: 'tympanogram', label: 'Tympanogram', type: 'select', options: ['Type A (normal)', 'Type B (flat)', 'Type C (negative pressure)', 'Not done'] },
      ],
    },
    {
      key: 'nose_throat',
      label: 'Nose & Throat',
      icon: 'Wind',
      fields: [
        { key: 'nasal_endoscopy', label: 'Nasal Endoscopy Findings', type: 'textarea', placeholder: 'e.g. DNS to right, polyp grade 2 bilateral' },
        { key: 'laryngoscopy', label: 'Laryngoscopy Findings', type: 'textarea', placeholder: 'e.g. Both VF mobile, no mass seen' },
        { key: 'voice_quality', label: 'Voice Quality', type: 'select', options: ['Normal', 'Hoarse', 'Breathy', 'Aphonic', 'Strained'] },
        { key: 'swallowing', label: 'Swallowing', type: 'select', options: ['Normal', 'Dysphagia to solids', 'Dysphagia to liquids', 'Odynophagia', 'Unable to swallow'] },
      ],
    },
    {
      key: 'postop_ent',
      label: 'Post-operative Care',
      icon: 'Stethoscope',
      fields: [
        { key: 'nasal_pack', label: 'Nasal Pack', type: 'select', options: ['In-situ', 'Removed', 'Not applicable'] },
        { key: 'tracheostomy', label: 'Tracheostomy', type: 'boolean' },
        { key: 'speaking_valve', label: 'Speaking Valve In Use', type: 'boolean' },
        { key: 'tracheostomy_care', label: 'Tracheostomy Care Notes', type: 'textarea', placeholder: 'e.g. Inner tube changed, secretions minimal' },
      ],
    },
  ],
};

const OPHTHALMOLOGY: SpecialtyTemplate = {
  specialty: 'ophthalmology',
  displayName: 'Ophthalmology',
  color: 'cyan',
  modules: { pac: true, otList: true, preOp: true, podTracking: true },
  labels: { pacModule: 'PAC Status', procedureList: 'OT List' },
  fieldGroups: [
    {
      key: 'visual_function',
      label: 'Visual Function',
      icon: 'Eye',
      fields: [
        { key: 'va_right_bcva', label: 'VA Right (BCVA)', type: 'text', placeholder: 'e.g. 6/6, 6/9, HM, PL, NPL' },
        { key: 'va_left_bcva', label: 'VA Left (BCVA)', type: 'text', placeholder: 'e.g. 6/6, 6/12, FC' },
        { key: 'iop_right', label: 'IOP Right (mmHg)', type: 'number', min: 0, max: 80, unit: 'mmHg' },
        { key: 'iop_left', label: 'IOP Left (mmHg)', type: 'number', min: 0, max: 80, unit: 'mmHg' },
      ],
    },
    {
      key: 'anterior_segment',
      label: 'Anterior Segment (Slit Lamp)',
      icon: 'FlashlightIcon',
      fields: [
        { key: 'cornea_right', label: 'Cornea (Right)', type: 'text', placeholder: 'e.g. Clear, oedematous, Descemet fold' },
        { key: 'cornea_left', label: 'Cornea (Left)', type: 'text', placeholder: 'e.g. Clear' },
        { key: 'ac_right', label: 'Anterior Chamber (Right)', type: 'select', options: ['Deep & quiet', 'Shallow', 'Cells present', 'Hyphaema', 'Hypopyon'] },
        { key: 'ac_left', label: 'Anterior Chamber (Left)', type: 'select', options: ['Deep & quiet', 'Shallow', 'Cells present', 'Hyphaema', 'Hypopyon'] },
        { key: 'lens_right', label: 'Lens (Right)', type: 'select', options: ['Clear', 'PCIOL in situ', 'Cataract – nuclear', 'Cataract – posterior subcapsular', 'Aphakic', 'Pseudophakic'] },
        { key: 'lens_left', label: 'Lens (Left)', type: 'select', options: ['Clear', 'PCIOL in situ', 'Cataract – nuclear', 'Cataract – posterior subcapsular', 'Aphakic', 'Pseudophakic'] },
      ],
    },
    {
      key: 'posterior_segment',
      label: 'Posterior Segment (Fundus)',
      icon: 'Circle',
      fields: [
        { key: 'disc_right', label: 'Disc (Right)', type: 'text', placeholder: 'e.g. Normal, Pallor, Cupped C:D 0.7' },
        { key: 'disc_left', label: 'Disc (Left)', type: 'text', placeholder: 'e.g. Normal' },
        { key: 'macula_right', label: 'Macula (Right)', type: 'text', placeholder: 'e.g. Normal, CSME, Macular hole' },
        { key: 'macula_left', label: 'Macula (Left)', type: 'text', placeholder: 'e.g. Normal' },
      ],
    },
    {
      key: 'postop_eye',
      label: 'Post-operative Eye Care',
      icon: 'Droplet',
      fields: [
        { key: 'postop_drops', label: 'Post-op Drops Schedule', type: 'textarea', placeholder: 'e.g. Moxifloxacin 4 hourly, Prednisolone 6 hourly' },
        { key: 'shield_patch', label: 'Eye Shield/Patch', type: 'select', options: ['In-situ', 'Removed', 'Not applicable'] },
        { key: 'iop_control', label: 'IOP Control', type: 'select', options: ['Good (<21 mmHg)', 'Borderline (21-30 mmHg)', 'Poor (>30 mmHg)'] },
      ],
    },
  ],
};

const UROLOGY: SpecialtyTemplate = {
  specialty: 'urology',
  displayName: 'Urology',
  color: 'amber',
  modules: { pac: true, otList: true, preOp: true, podTracking: true },
  labels: { pacModule: 'PAC Status', procedureList: 'OT List' },
  fieldGroups: [
    {
      key: 'renal_function',
      label: 'Renal Function',
      icon: 'Activity',
      fields: [
        { key: 'urine_output', label: 'Urine Output (mL/24h)', type: 'number', unit: 'mL/24h' },
        { key: 'serum_creatinine', label: 'Serum Creatinine (mg/dL)', type: 'number', unit: 'mg/dL' },
        { key: 'egfr', label: 'eGFR (mL/min/1.73m²)', type: 'number', unit: 'mL/min' },
        { key: 'psa', label: 'PSA (ng/mL)', type: 'number', unit: 'ng/mL' },
      ],
    },
    {
      key: 'catheter_care',
      label: 'Catheter Management',
      icon: 'Pipette',
      fields: [
        { key: 'catheter_type', label: 'Catheter Type', type: 'select', options: ['Urethral IDC (Foley)', 'Suprapubic Catheter', 'Nephrostomy', 'DJ Stent', 'Not catheterised'] },
        { key: 'catheter_size', label: 'Catheter Size (Fr)', type: 'number', unit: 'Fr' },
        { key: 'catheter_inserted', label: 'Catheter Inserted On', type: 'date' },
        { key: 'catheter_change_due', label: 'Catheter Change Due', type: 'date' },
        { key: 'urine_character', label: 'Urine Character', type: 'select', options: ['Clear yellow', 'Concentrated', 'Haematuria (mild)', 'Haematuria (frank)', 'Clots', 'Cloudy / infected'] },
      ],
    },
    {
      key: 'stone_disease',
      label: 'Stone Disease',
      icon: 'Diamond',
      fields: [
        { key: 'stone_location', label: 'Stone Location', type: 'select', options: ['Right kidney', 'Left kidney', 'Right ureter (upper)', 'Right ureter (mid)', 'Right ureter (lower)', 'Left ureter (upper)', 'Left ureter (mid)', 'Left ureter (lower)', 'Bladder', 'Not applicable'] },
        { key: 'stone_size', label: 'Stone Size (mm)', type: 'number', unit: 'mm' },
        { key: 'stone_composition', label: 'Stone Composition', type: 'text', placeholder: 'e.g. Calcium oxalate (if known from analysis)' },
      ],
    },
    {
      key: 'postop_urology',
      label: 'Post-operative',
      icon: 'CheckCircle',
      fields: [
        { key: 'void_trial_result', label: 'Void Trial Result', type: 'select', options: ['Passed (voiding well)', 'Failed (re-catheterised)', 'Not attempted', 'Not applicable'] },
        { key: 'pvr', label: 'Post-Void Residual (mL)', type: 'number', unit: 'mL' },
        { key: 'haematuria_clearance', label: 'Haematuria Clearance', type: 'select', options: ['Cleared', 'Mild persistent', 'Frank haematuria', 'Not applicable'] },
      ],
    },
  ],
};

const NEUROSURGERY: SpecialtyTemplate = {
  specialty: 'neurosurgery',
  displayName: 'Neurosurgery',
  color: 'purple',
  modules: { pac: true, otList: true, preOp: true, podTracking: true },
  labels: { pacModule: 'PAC Status', procedureList: 'OT List' },
  fieldGroups: [
    {
      key: 'neuro_status',
      label: 'Neurological Status',
      icon: 'Brain',
      fields: [
        { key: 'gcs_eye', label: 'GCS – Eyes (E)', type: 'score', min: 1, max: 4 },
        { key: 'gcs_verbal', label: 'GCS – Verbal (V)', type: 'score', min: 1, max: 5 },
        { key: 'gcs_motor', label: 'GCS – Motor (M)', type: 'score', min: 1, max: 6 },
        { key: 'pupil_right_size', label: 'Pupil Right (mm)', type: 'number', min: 1, max: 9, unit: 'mm' },
        { key: 'pupil_right_reaction', label: 'Pupil Right Reaction', type: 'select', options: ['Brisk', 'Sluggish', 'Fixed', 'Not assessed'] },
        { key: 'pupil_left_size', label: 'Pupil Left (mm)', type: 'number', min: 1, max: 9, unit: 'mm' },
        { key: 'pupil_left_reaction', label: 'Pupil Left Reaction', type: 'select', options: ['Brisk', 'Sluggish', 'Fixed', 'Not assessed'] },
        { key: 'focal_deficit', label: 'Focal Neurological Deficit', type: 'textarea', placeholder: 'e.g. Right hemiparesis, power 3/5 RUL, 2/5 RLL' },
      ],
    },
    {
      key: 'icp_monitoring',
      label: 'Intracranial Monitoring',
      icon: 'Gauge',
      fields: [
        { key: 'icp_mmhg', label: 'ICP (mmHg)', type: 'number', min: 0, max: 100, unit: 'mmHg' },
        { key: 'cpp_mmhg', label: 'CPP (mmHg)', type: 'number', min: 0, max: 150, unit: 'mmHg' },
        { key: 'evd_output', label: 'EVD Drain Output (mL/day)', type: 'number', unit: 'mL' },
        { key: 'evd_level', label: 'EVD Level (cm above tragus)', type: 'number', unit: 'cm' },
      ],
    },
    {
      key: 'postop_neurosx',
      label: 'Post-craniotomy / Spine',
      icon: 'Zap',
      fields: [
        { key: 'csf_leak', label: 'CSF Leak', type: 'boolean' },
        { key: 'seizure_prophylaxis', label: 'Seizure Prophylaxis', type: 'boolean' },
        { key: 'steroid_tapering', label: 'Steroid Tapering', type: 'text', placeholder: 'e.g. Dexamethasone 4mg 8 hourly, taper over 5 days' },
        { key: 'spinal_level', label: 'Spinal Level (if spine case)', type: 'text', placeholder: 'e.g. L4-L5' },
        { key: 'asia_grade', label: 'ASIA Grade', type: 'select', options: ['A – Complete', 'B – Sensory incomplete', 'C – Motor incomplete <3', 'D – Motor incomplete ≥3', 'E – Normal', 'Not applicable'] },
        { key: 'bladder_function', label: 'Bladder Function', type: 'select', options: ['Normal', 'Retention (catheterised)', 'Neurogenic bladder', 'Not applicable'] },
      ],
    },
  ],
};

const PULMONOLOGY: SpecialtyTemplate = {
  specialty: 'pulmonology',
  displayName: 'Pulmonology',
  color: 'sky',
  modules: { pac: false, otList: false, preOp: false, podTracking: false },
  labels: { pacModule: 'Pre-Bronchoscopy', procedureList: 'Procedure List' },
  fieldGroups: [
    {
      key: 'respiratory_status',
      label: 'Respiratory Status',
      icon: 'Wind',
      fields: [
        { key: 'o2_delivery', label: 'O₂ Delivery Mode', type: 'select', options: ['Room air', 'Nasal cannula', 'Simple face mask', 'Non-rebreather mask', 'HFNC', 'NIV (BiPAP/CPAP)', 'Invasive ventilation'] },
        { key: 'o2_flow', label: 'O₂ Flow Rate (L/min)', type: 'number', min: 0, max: 60, unit: 'L/min' },
        { key: 'fio2', label: 'FiO₂ (if on HFNC/vent)', type: 'number', min: 21, max: 100, unit: '%' },
        { key: 'spo2_target', label: 'SpO₂ Target (%)', type: 'text', placeholder: 'e.g. 88-92% (COPD), >94% (Pneumonia)' },
      ],
    },
    {
      key: 'spirometry',
      label: 'Spirometry',
      icon: 'BarChart2',
      fields: [
        { key: 'fev1_percent', label: 'FEV1 (% predicted)', type: 'number', min: 10, max: 130, unit: '%' },
        { key: 'fvc_percent', label: 'FVC (% predicted)', type: 'number', min: 10, max: 130, unit: '%' },
        { key: 'fev1_fvc_ratio', label: 'FEV1/FVC Ratio', type: 'number', min: 0.2, max: 1.0 },
        { key: 'obstruction_pattern', label: 'Pattern', type: 'select', options: ['Normal', 'Obstructive', 'Restrictive', 'Mixed', 'Not done'] },
      ],
    },
    {
      key: 'abg',
      label: 'Arterial Blood Gas (ABG)',
      icon: 'Droplet',
      fields: [
        { key: 'abg_ph', label: 'pH', type: 'number' },
        { key: 'abg_pco2', label: 'pCO₂ (mmHg)', type: 'number', unit: 'mmHg' },
        { key: 'abg_po2', label: 'pO₂ (mmHg)', type: 'number', unit: 'mmHg' },
        { key: 'abg_hco3', label: 'HCO₃ (mEq/L)', type: 'number', unit: 'mEq/L' },
        { key: 'abg_interpretation', label: 'ABG Interpretation', type: 'text', placeholder: 'e.g. Type II respiratory failure, partially compensated respiratory acidosis' },
      ],
    },
    {
      key: 'sputum_infection',
      label: 'Sputum & Infection',
      icon: 'ShieldAlert',
      fields: [
        { key: 'sputum_culture_sent', label: 'Sputum Culture Sent', type: 'boolean' },
        { key: 'sputum_organism', label: 'Organism (if known)', type: 'text', placeholder: 'e.g. K. pneumoniae, MRSA' },
        { key: 'afb_status', label: 'AFB / TB Status', type: 'select', options: ['Not suspected', 'AFB sent – pending', 'AFB negative', 'AFB positive', 'Confirmed PTB', 'EPTB'] },
        { key: 'atkins_decaf', label: 'DECAF Score (COPD exac.)', type: 'score', min: 0, max: 6 },
      ],
    },
  ],
};

const ONCOLOGY: SpecialtyTemplate = {
  specialty: 'oncology',
  displayName: 'Oncology',
  color: 'slate',
  modules: { pac: false, otList: true, preOp: false, podTracking: false },
  labels: { pacModule: 'Pre-Chemo Assessment', procedureList: 'Procedure List' },
  fieldGroups: [
    {
      key: 'tumour_details',
      label: 'Tumour Details',
      icon: 'Target',
      fields: [
        { key: 'primary_site', label: 'Primary Site', type: 'text', placeholder: 'e.g. Left breast, Right lung, Sigmoid colon' },
        { key: 'histology', label: 'Histology', type: 'text', placeholder: 'e.g. IDC grade 2, Adenocarcinoma' },
        { key: 'stage_t', label: 'Stage T', type: 'text', placeholder: 'e.g. T2' },
        { key: 'stage_n', label: 'Stage N', type: 'text', placeholder: 'e.g. N1' },
        { key: 'stage_m', label: 'Stage M', type: 'text', placeholder: 'e.g. M0' },
        { key: 'overall_stage', label: 'Overall Stage', type: 'select', options: ['Stage I', 'Stage II', 'Stage IIA', 'Stage IIB', 'Stage III', 'Stage IIIA', 'Stage IIIB', 'Stage IIIC', 'Stage IV', 'Unknown'] },
        { key: 'metastasis_sites', label: 'Metastasis Sites', type: 'text', placeholder: 'e.g. Liver, Lung, Bone (L3 vertebra)' },
      ],
    },
    {
      key: 'performance_treatment',
      label: 'Performance & Treatment',
      icon: 'Activity',
      fields: [
        { key: 'ecog_score', label: 'ECOG Performance Status', type: 'select', options: ['0 – Fully active', '1 – Restricted in strenuous activity', '2 – Ambulatory, self-care', '3 – Limited self-care', '4 – Completely disabled'] },
        { key: 'current_regimen', label: 'Current Chemotherapy Regimen', type: 'text', placeholder: 'e.g. AC-T, FOLFOX, Carboplatin-Paclitaxel' },
        { key: 'cycle_number', label: 'Cycle Number', type: 'number', min: 1, max: 30 },
        { key: 'cycle_day', label: 'Day of Cycle', type: 'number', min: 1, max: 28 },
        { key: 'intent', label: 'Treatment Intent', type: 'select', options: ['Curative', 'Palliative', 'Neo-adjuvant', 'Adjuvant', 'Maintenance'] },
      ],
    },
    {
      key: 'toxicity',
      label: 'Treatment Toxicity',
      icon: 'AlertTriangle',
      fields: [
        { key: 'nausea_grade', label: 'Nausea Grade (CTCAE)', type: 'select', options: ['Grade 0 – None', 'Grade 1 – Mild', 'Grade 2 – Moderate', 'Grade 3 – Severe', 'Grade 4 – Life-threatening'] },
        { key: 'neutropenia', label: 'Neutropenia', type: 'select', options: ['None', 'Grade 1 (ANC 1.5-2.0)', 'Grade 2 (ANC 1.0-1.5)', 'Grade 3 (ANC 0.5-1.0)', 'Grade 4/Febrile (ANC <0.5)'] },
        { key: 'mucositis', label: 'Mucositis', type: 'select', options: ['None', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4'] },
        { key: 'peripheral_neuropathy', label: 'Peripheral Neuropathy', type: 'select', options: ['None', 'Grade 1 – Asymptomatic', 'Grade 2 – Moderate symptoms', 'Grade 3 – Severe, limits ADL'] },
        { key: 'tumour_marker', label: 'Tumour Marker Name', type: 'text', placeholder: 'e.g. CA-125, CEA, PSA, AFP' },
        { key: 'tumour_marker_value', label: 'Tumour Marker Value', type: 'text', placeholder: 'e.g. 450 U/mL (baseline 800)' },
      ],
    },
  ],
};

// ─── Registry ─────────────────────────────────────────────────────────────────

export const SPECIALTY_TEMPLATES: Record<SpecialtyKey, SpecialtyTemplate> = {
  orthopaedics:    ORTHOPAEDICS,
  medicine:        MEDICINE,
  cardiology:      CARDIOLOGY,
  neurology:       NEUROLOGY,
  paediatrics:     PAEDIATRICS,
  general_surgery: GENERAL_SURGERY,
  obg:             OBG,
  psychiatry:      PSYCHIATRY,
  ent:             ENT,
  ophthalmology:   OPHTHALMOLOGY,
  urology:         UROLOGY,
  neurosurgery:    NEUROSURGERY,
  pulmonology:     PULMONOLOGY,
  oncology:        ONCOLOGY,
};

export const SPECIALTY_DISPLAY_NAMES: Record<SpecialtyKey, string> = Object.fromEntries(
  Object.entries(SPECIALTY_TEMPLATES).map(([k, t]) => [k, t.displayName])
) as Record<SpecialtyKey, string>;

/** Detect specialty from department string stored in hospital_config */
export function detectSpecialtyFromDepartment(department: string): SpecialtyKey {
  const d = department.toLowerCase();
  if (d.includes('ortho'))         return 'orthopaedics';
  if (d.includes('cardiology'))    return 'cardiology';
  if (d.includes('cardiothoracic')) return 'general_surgery';
  if (d.includes('neurosurg'))     return 'neurosurgery';
  if (d.includes('neurol'))        return 'neurology';
  if (d.includes('paediat') || d.includes('pediatr')) return 'paediatrics';
  if (d.includes('gynaec') || d.includes('obstet') || d.includes('obg')) return 'obg';
  if (d.includes('psychiatr'))     return 'psychiatry';
  if (d.includes('ent') || d.includes('otol') || d.includes('rhinol')) return 'ent';
  if (d.includes('ophthal'))       return 'ophthalmology';
  if (d.includes('urol'))          return 'urology';
  if (d.includes('pulmon') || d.includes('respirat') || d.includes('chest')) return 'pulmonology';
  if (d.includes('oncol'))         return 'oncology';
  if (d.includes('general surg'))  return 'general_surgery';
  return 'medicine'; // default for medicine/general/internal medicine
}
