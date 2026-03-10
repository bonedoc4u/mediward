import { Patient, Gender, PacStatus, PatientStatus, Investigation } from '../types';

// Helper to create dates relative to today for dynamic POD calculation demo
const today = new Date();
const daysAgo = (days: number) => {
  const date = new Date(today);
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
};

const mockInvestigations: Investigation[] = [
  {
    id: "inv-1",
    date: daysAgo(5),
    type: "X-Ray Pelvis AP",
    findings: "# NOF Right displaced",
    imageUrl: "https://picsum.photos/400/400?grayscale&blur=1"
  },
  {
    id: "inv-2",
    date: daysAgo(1),
    type: "X-Ray Knee AP/Lat",
    findings: "Comminuted fracture proximal tibia",
    imageUrl: "https://picsum.photos/401/401?grayscale&blur=1"
  },
  {
    id: "inv-3",
    date: daysAgo(10),
    type: "CT Knee",
    findings: "Intra-articular extension confirmed",
    imageUrl: "https://picsum.photos/402/402?grayscale&blur=1"
  }
];

export const loadDummyData = (): Patient[] => {
  return [
    {
      bed: "40",
      ward: "Ward 24",
      ipNo: "4001", // Placeholder IP
      name: "Kadeeja",
      mobile: "9988776655",
      age: 70, // Est based on dx
      gender: Gender.Female,
      diagnosis: "# NOF Right",
      comorbidities: [],
      doa: daysAgo(2),
      pacStatus: PacStatus.Pending,
      pacChecklist: [
        { id: 'pc1', task: 'Cardiology Opinion', isDone: true },
        { id: 'pc2', task: 'Echo', isDone: false }
      ],
      patientStatus: PatientStatus.Review,
      dailyRounds: [
        {
            date: daysAgo(1),
            note: "Pain managed, awaiting Cardio fitness.",
            todos: [{ id: 'old1', task: 'Trop T', isDone: true }]
        }
      ],
      investigations: [mockInvestigations[0]],
      labResults: [],
      todos: [
        { id: 't1', task: 'Cardio clearance pending', isDone: false }
      ]
    },
    {
      bed: "16",
      ward: "Ward 10",
      ipNo: "81226",
      name: "Shaji",
      mobile: "9876543210",
      age: 63,
      gender: Gender.Male,
      diagnosis: "#IT Right",
      comorbidities: ["NOCM"],
      doa: daysAgo(5),
      pacStatus: PacStatus.Fit,
      pacChecklist: [],
      patientStatus: PatientStatus.Fit,
      dailyRounds: [
         {
            date: daysAgo(2),
            note: "Sugar levels fluctuating.",
            todos: [{ id: 'old2', task: 'GRBS q4h', isDone: true }]
         }
      ],
      investigations: [],
      labResults: [
        { id: 'l1', date: daysAgo(5), type: 'FBS', value: 110 },
        { id: 'l2', date: daysAgo(5), type: 'PPBS', value: 140 },
        { id: 'l3', date: daysAgo(1), type: 'FBS', value: 98 },
        { id: 'l4', date: daysAgo(1), type: 'PPBS', value: 135 },
      ],
      todos: []
    },
    {
      bed: "31",
      ward: "Ortho ICU",
      ipNo: "3101",
      name: "Shahid",
      mobile: "9123456789",
      age: 35, // Est
      gender: Gender.Male,
      diagnosis: "# SOH left with Neurovascular injury with comminuted displaced intercondylar #; # SOF left; # scaphoid; # 2nd Matacarpal base",
      comorbidities: [],
      doa: daysAgo(8),
      procedure: "External Fixation + Vasc Repair",
      dos: daysAgo(3),
      pacStatus: PacStatus.Fit,
      pacChecklist: [],
      patientStatus: PatientStatus.Review,
      dailyRounds: [
        {
            date: daysAgo(1),
            note: "Dressing soaked, changed. Vitals stable.",
            todos: [{id: 'old3', task: 'Limb elevation', isDone: true}, {id: 'old4', task: 'Check distal pulses', isDone: true}]
        }
      ],
      investigations: [mockInvestigations[1], mockInvestigations[2]],
      labResults: [
         { id: 'l5', date: daysAgo(3), type: 'ESR', value: 45 },
         { id: 'l6', date: daysAgo(3), type: 'CRP', value: 68 },
         { id: 'l7', date: daysAgo(1), type: 'ESR', value: 30 },
         { id: 'l8', date: daysAgo(1), type: 'CRP', value: 42 },
      ],
      todos: [
        { id: 't2', task: 'Monitor distal pulse hourly', isDone: true },
        { id: 't3', task: 'Limb elevation', isDone: true }
      ]
    },
    {
      bed: "34",
      ward: "Ward 10",
      ipNo: "3401",
      name: "Kumar",
      mobile: "9000011111",
      age: 45,
      gender: Gender.Male,
      diagnosis: "Infected Wound Leg", // Implied from "inj cefosal b" context
      comorbidities: [],
      doa: daysAgo(2),
      pacStatus: PacStatus.Pending,
      pacChecklist: [],
      patientStatus: PatientStatus.Review,
      dailyRounds: [],
      investigations: [],
      labResults: [],
      todos: [
        { id: 't4', task: 'Inj Cefosal B', isDone: false }
      ]
    },
    {
      bed: "29",
      ward: "Ward 24",
      ipNo: "86955",
      name: "Mohan pilla",
      mobile: "8888899999",
      age: 60,
      gender: Gender.Male,
      diagnosis: "United # tibia right with implant insitu",
      comorbidities: ["Psy"],
      doa: daysAgo(4),
      procedure: "Implant Removal",
      pacStatus: PacStatus.Fit,
      pacChecklist: [],
      patientStatus: PatientStatus.Fit,
      dailyRounds: [],
      investigations: [],
      labResults: [],
      todos: []
    }
  ];
};