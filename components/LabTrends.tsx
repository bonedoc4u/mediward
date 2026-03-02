import React, { useState, useMemo } from 'react';
import { Patient, LabResult, LabTypeConfig } from '../types';
import { useConfig } from '../contexts/AppContext';
import { Activity, Plus, Droplet, Flame } from 'lucide-react';

interface Props {
  patients: Patient[];
  onAddResult: (patientId: string, result: LabResult) => void;
}

// Simple SVG Line Chart Component
const SimpleLineChart = ({ data, lines, height = 200 }: { data: any[], lines: { key: string, color: string }[], height?: number }) => {
    if (!data || data.length < 2) return <div className="h-48 flex items-center justify-center text-slate-400 text-xs">Not enough data to graph</div>;

    const sortedData = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let allValues: number[] = [];
    lines.forEach(line => {
        sortedData.forEach(d => {
            if (d[line.key] !== undefined) allValues.push(d[line.key]);
        });
    });

    if (allValues.length === 0) return <div className="h-48 flex items-center justify-center text-slate-400 text-xs">No values</div>;

    const minVal = Math.min(...allValues) * 0.9;
    const maxVal = Math.max(...allValues) * 1.1;
    const range = maxVal - minVal;

    return (
        <div className="w-full mt-4 bg-white rounded border border-slate-100 p-2">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full" style={{ height: `${height}px` }}>
                <line x1="0" y1="0" x2="100" y2="0" stroke="#f1f5f9" strokeWidth="0.5" />
                <line x1="0" y1="50" x2="100" y2="50" stroke="#f1f5f9" strokeWidth="0.5" />
                <line x1="0" y1="100" x2="100" y2="100" stroke="#f1f5f9" strokeWidth="0.5" />

                {lines.map((line) => {
                    const points = sortedData.map((d, i) => {
                        const val = d[line.key];
                        if (val === undefined) return null;
                        const x = (i / (sortedData.length - 1)) * 100;
                        const y = 100 - (((val - minVal) / range) * 100);
                        return `${x},${y}`;
                    }).filter(p => p !== null);

                    if (points.length < 1) return null;

                    return (
                        <g key={line.key}>
                            <polyline points={points.join(' ')} fill="none" stroke={line.color}
                                strokeWidth="2" vectorEffect="non-scaling-stroke" />
                            {sortedData.map((d, i) => {
                                const val = d[line.key];
                                if (val === undefined) return null;
                                const x = (i / (sortedData.length - 1)) * 100;
                                const y = 100 - (((val - minVal) / range) * 100);
                                return (
                                    <circle key={i} cx={x} cy={y} r="2" fill={line.color}
                                        stroke="white" strokeWidth="0.5">
                                        <title>{d.date}: {val}</title>
                                    </circle>
                                );
                            })}
                        </g>
                    );
                })}
            </svg>
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>{sortedData[0].date}</span>
                <span>{sortedData[sortedData.length - 1].date}</span>
            </div>
            <div className="flex gap-4 justify-center mt-2">
                {lines.map(l => (
                    <div key={l.key} className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} />
                        <span className="text-xs text-slate-600">{l.key}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

// Cycle of colors for chart lines within a category
const LINE_COLORS = ['#3b82f6', '#93c5fd', '#ea580c', '#fdba74', '#10b981', '#6ee7b7', '#8b5cf6', '#c4b5fd'];

// Category header styling — well-known categories get themed icons/colors, others fall back to a neutral style
function getCategoryStyle(category: string): { icon: React.ReactNode; headerClass: string } {
  const cat = category.toLowerCase();
  if (cat === 'diabetes' || cat === 'glycemic') {
    return {
      icon: <Droplet className="w-5 h-5 text-blue-500" />,
      headerClass: 'bg-blue-50/50',
    };
  }
  if (cat === 'infection' || cat === 'inflammation') {
    return {
      icon: <Flame className="w-5 h-5 text-orange-500" />,
      headerClass: 'bg-orange-50/50',
    };
  }
  return {
    icon: <Activity className="w-5 h-5 text-slate-500" />,
    headerClass: 'bg-slate-50',
  };
}

// ─── Category Panel ───
const CategoryPanel: React.FC<{
  category: string;
  labTypes: LabTypeConfig[];
  labResults: LabResult[];
  date: string;
  onDateChange: (d: string) => void;
  inputs: Record<string, string>;
  onInputChange: (name: string, val: string) => void;
  onAdd: (labTypes: LabTypeConfig[]) => void;
}> = ({ category, labTypes, labResults, date, onDateChange, inputs, onInputChange, onAdd }) => {
  const { icon, headerClass } = getCategoryStyle(category);

  const getGroupedData = (types: LabTypeConfig[]) => {
    const typeNames = types.map(t => t.name);
    const dates = Array.from(new Set(
      labResults.filter(r => typeNames.includes(r.type)).map(r => r.date)
    )).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    return dates.map(d => {
      const dayResults = labResults.filter(r => r.date === d);
      const values: Record<string, number | undefined> = {};
      types.forEach(t => { values[t.name] = dayResults.find(r => r.type === t.name)?.value; });
      return { date: d, ...values };
    });
  };

  const grouped = getGroupedData(labTypes);
  const chartLines = labTypes.map((t, i) => ({ key: t.name, color: LINE_COLORS[i % LINE_COLORS.length] }));
  const addButtonColor = getCategoryStyle(category).headerClass.includes('blue') ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700';

  const renderValueCell = (value: number | undefined, labType: LabTypeConfig) => {
    if (value === undefined) return <span className="text-slate-300">—</span>;
    const isHigh = labType.alertHigh !== null && value > labType.alertHigh;
    return <span className={isHigh ? 'text-red-600 font-bold' : 'text-slate-700 font-medium'}>{value}</span>;
  };

  return (
    <div className="bg-white rounded-lg shadow border border-slate-200 overflow-hidden flex flex-col">
      <div className={`p-4 border-b border-slate-100 ${headerClass} flex items-center gap-2`}>
        {icon}
        <h3 className="font-bold text-slate-800">{category}</h3>
        <span className="text-xs text-slate-500 ml-1">
          ({labTypes.map(t => `${t.name}${t.unit ? ` / ${t.unit}` : ''}`).join(', ')})
        </span>
      </div>

      <div className="px-4">
        <SimpleLineChart data={grouped} lines={chartLines} />
      </div>

      {/* Input row */}
      <div className="p-4 bg-slate-50 border-t border-b border-slate-100 grid grid-cols-12 gap-2 items-end mt-4">
        <div className="col-span-12 md:col-span-4">
          <label className="text-[10px] uppercase font-bold text-slate-500">Date</label>
          <input type="date" value={date} onChange={e => onDateChange(e.target.value)}
            className="w-full p-1.5 text-sm border rounded" />
        </div>
        {labTypes.map((lt, i) => (
          <div key={lt.name} className={`col-span-${Math.floor(8 / labTypes.length)} md:col-span-${Math.floor(6 / labTypes.length) || 2}`}>
            <label className="text-[10px] uppercase font-bold text-slate-500">
              {lt.name}{lt.unit ? ` (${lt.unit})` : ''}
            </label>
            <input type="number" placeholder="Value" value={inputs[lt.name] ?? ''}
              onChange={e => onInputChange(lt.name, e.target.value)}
              className="w-full p-1.5 text-sm border rounded" />
          </div>
        ))}
        <div className="col-span-2 md:col-span-2">
          <button onClick={() => onAdd(labTypes)}
            className={`w-full ${addButtonColor} text-white p-1.5 rounded flex items-center justify-center`}>
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Table */}
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-slate-500 uppercase bg-slate-50">
          <tr>
            <th className="px-4 py-2">Date</th>
            {labTypes.map(lt => <th key={lt.name} className="px-4 py-2">{lt.name}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {grouped.map(row => (
            <tr key={row.date} className="hover:bg-slate-50">
              <td className="px-4 py-2 text-slate-500">{row.date}</td>
              {labTypes.map(lt => (
                <td key={lt.name} className="px-4 py-2">
                  {renderValueCell(row[lt.name] as number | undefined, lt)}
                </td>
              ))}
            </tr>
          ))}
          {grouped.length === 0 && (
            <tr><td colSpan={labTypes.length + 1} className="p-4 text-center text-slate-400 text-xs">No records found</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

// ─── Main LabTrends component ───
const LabTrends: React.FC<Props> = ({ patients, onAddResult }) => {
  const { labTypesByCategory } = useConfig();
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [inputs, setInputs] = useState<Record<string, string>>({});

  const selectedPatient = patients.find(p => p.ipNo === selectedPatientId);
  const labResults = selectedPatient?.labResults ?? [];

  const handleInputChange = (name: string, val: string) => {
    setInputs(prev => ({ ...prev, [name]: val }));
  };

  const handleAdd = (labTypes: LabTypeConfig[]) => {
    if (!selectedPatientId) return;
    labTypes.forEach(lt => {
      const val = inputs[lt.name];
      if (!val) return;
      const num = parseFloat(val);
      if (isNaN(num)) return;
      const newResult: LabResult = {
        id: Math.random().toString(36).substr(2, 9),
        date,
        type: lt.name,
        value: num,
      };
      onAddResult(selectedPatientId, newResult);
    });
    const cleared: Record<string, string> = {};
    labTypes.forEach(lt => { cleared[lt.name] = ''; });
    setInputs(prev => ({ ...prev, ...cleared }));
  };

  const categories = useMemo(() => Array.from(labTypesByCategory.entries()), [labTypesByCategory]);

  return (
    <div className="flex flex-col space-y-6">
      {/* Patient selector */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Select Patient to Track</label>
        <select
          className="w-full md:w-1/2 p-2 border border-slate-300 rounded-md bg-white text-sm"
          value={selectedPatientId}
          onChange={e => setSelectedPatientId(e.target.value)}
        >
          <option value="">-- Choose Patient --</option>
          {patients.map(p => (
            <option key={p.ipNo} value={p.ipNo}>Bed {p.bed}: {p.name}</option>
          ))}
        </select>
      </div>

      {!selectedPatient ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 rounded-lg border-2 border-dashed border-slate-300 text-slate-400 p-12">
          <Activity className="w-16 h-16 mb-2 opacity-50" />
          <p>Select a patient to view and update lab trends</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {categories.map(([category, labTypes]) => (
            <CategoryPanel
              key={category}
              category={category}
              labTypes={labTypes}
              labResults={labResults}
              date={date}
              onDateChange={setDate}
              inputs={inputs}
              onInputChange={handleInputChange}
              onAdd={handleAdd}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default LabTrends;
