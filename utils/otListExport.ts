import * as XLSX from 'xlsx-js-style';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { OTPatient, OTType } from './otListTypes';

export interface OTListExportMeta {
  hospitalName: string;
  department: string;
  selectedDate: string;
  surgeon: string;
  surgeonUnit: string;
  otTime: string;
}

export function exportOTListToExcel(otList: OTPatient[], activeTab: OTType, meta: OTListExportMeta): void {
  const { hospitalName, department, selectedDate, surgeon, surgeonUnit, otTime } = meta;
  const wb = XLSX.utils.book_new();
  const wsData: any[][] = [];

  wsData.push([hospitalName]);
  wsData.push([department]);
  wsData.push([`${activeTab.toUpperCase()} OPERATION LIST`]);

  const dateStr = selectedDate.split('-').reverse().join('/');
  wsData.push([`DATE:${dateStr}    SURGEON : ${surgeon}    UNIT :${surgeonUnit}               TIME:${otTime}`]);

  let lastCategory = '';
  let displaySequence = 1;

  const exportList = [...otList].filter(p => p.otType === activeTab).sort((a, b) => {
      if (a.category === b.category) return a.sequence - b.sequence;
      return (a.category || '').localeCompare(b.category || '');
  });

  const colHeaders = ["SL NO", "IP NO", "UNIT", "NAME", "AGE", "WARD", "DIAGNOSIS", "OPERATION", "C ARM", "IMPLANTS"];

  let currentRowIndex = 4;
  const headerRows = [0, 1, 2, 3];
  const categoryHeaderRows: number[] = [];
  const dataRows: number[] = [];

  exportList.forEach(patient => {
      if (patient.category && patient.category !== lastCategory) {
          wsData.push([patient.category, ...colHeaders]);
          categoryHeaderRows.push(currentRowIndex);
          currentRowIndex++;
          lastCategory = patient.category;
          displaySequence = 1;
      }

      const wardNum = patient.ward.replace(/Ward\s*/i, '').trim();

      wsData.push([
          '', displaySequence++, patient.ipNo, patient.unit, patient.name,
          `${patient.age}/${patient.gender}`, wardNum, patient.diagnosis,
          patient.procedure, patient.cArm, patient.implants
      ]);
      dataRows.push(currentRowIndex);
      currentRowIndex++;
  });

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  const borderStyle = {
      top: { style: "thin", color: { rgb: "000000" } },
      bottom: { style: "thin", color: { rgb: "000000" } },
      left: { style: "thin", color: { rgb: "000000" } },
      right: { style: "thin", color: { rgb: "000000" } }
  };

  const globalHeaderStyle = {
      font: { bold: true, sz: 12 },
      alignment: { horizontal: "center", vertical: "center" },
      fill: { fgColor: { rgb: "FFFFFF" } }
  };

  const categoryHeaderStyle = {
      font: { bold: true },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      fill: { fgColor: { rgb: "FFF2CC" } },
      border: borderStyle
  };

  const dataCellStyle = {
      font: { sz: 10 },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: borderStyle
  };

  const range = XLSX.utils.decode_range(ws['!ref'] || "A1:A1");

  for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[cellRef]) continue;

          if (headerRows.includes(R)) {
              ws[cellRef].s = globalHeaderStyle;
          } else if (categoryHeaderRows.includes(R)) {
              ws[cellRef].s = categoryHeaderStyle;
          } else if (dataRows.includes(R)) {
              ws[cellRef].s = dataCellStyle;
          }
      }
  }

  if (!ws['!merges']) ws['!merges'] = [];
  headerRows.forEach(r => {
      ws['!merges']?.push({ s: { r: r, c: 0 }, e: { r: r, c: 10 } });
  });

  ws['!cols'] = [
      { wch: 15 }, { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 25 },
      { wch: 10 }, { wch: 8 }, { wch: 30 }, { wch: 30 }, { wch: 10 }, { wch: 20 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, `${activeTab} OT List`);
  XLSX.writeFile(wb, `${activeTab}_OT_List_${selectedDate}.xlsx`);
}

export function exportOTListToPDF(otList: OTPatient[], activeTab: OTType, meta: OTListExportMeta): void {
  const { hospitalName, department, selectedDate, surgeon, surgeonUnit, otTime } = meta;
  const doc = new jsPDF('l', 'mm', 'a4');

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);

  const pageWidth = doc.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;

  doc.text(hospitalName, centerX, 10, { align: 'center' });
  doc.text(department, centerX, 16, { align: 'center' });
  doc.text(`${activeTab.toUpperCase()} OPERATION LIST`, centerX, 22, { align: 'center' });

  doc.setFontSize(10);
  const dateStr = selectedDate.split('-').reverse().join('/');
  const subHeaderY = 30;
  doc.text(
    `DATE:${dateStr}    SURGEON : ${surgeon}    UNIT :${surgeonUnit}               TIME:${otTime}`,
    14, subHeaderY
  );

  const tableRows: any[] = [];
  let lastCategory = '';
  let displaySequence = 1;

  const sortedList = [...otList].filter(p => p.otType === activeTab).sort((a, b) => {
      if (a.category === b.category) return a.sequence - b.sequence;
      return (a.category || '').localeCompare(b.category || '');
  });

  const headers = ["SL NO", "IP NO", "UNIT", "NAME", "AGE", "WARD", "DIAGNOSIS", "OPERATION", "C ARM", "IMPLANTS"];

  sortedList.forEach(patient => {
      if (patient.category && patient.category !== lastCategory) {
          tableRows.push([
              { content: patient.category, styles: { fontStyle: 'bold', halign: 'center', valign: 'middle' } },
              ...headers.map(h => ({ content: h, styles: { fontStyle: 'bold', halign: 'center', valign: 'middle' } }))
          ]);
          lastCategory = patient.category;
          displaySequence = 1;
      }

      const wardNum = patient.ward.replace(/Ward\s*/i, '').trim();

      tableRows.push([
          '', displaySequence++, patient.ipNo, patient.unit, patient.name,
          `${patient.age}/${patient.gender}`, wardNum, patient.diagnosis,
          patient.procedure, patient.cArm, patient.implants
      ]);
  });

  autoTable(doc, {
    body: tableRows,
    startY: 35,
    theme: 'grid',
    styles: {
        fontSize: 8, cellPadding: 1.5, lineColor: [0, 0, 0], lineWidth: 0.1,
        font: 'helvetica', fontStyle: 'bold', textColor: [0, 0, 0],
        valign: 'middle', overflow: 'linebreak', halign: 'center'
    },
    didParseCell: (data: any) => {
        const row = data.row;
        if (row && Array.isArray(row.raw)) {
           const cell2 = row.raw[1] as unknown;
           const isHeader = typeof cell2 === 'object' && cell2 !== null &&
             'content' in cell2 && (cell2 as { content: unknown }).content === 'SL NO';

           if (isHeader) {
               data.cell.styles.fillColor = [255, 242, 204];
           }
        }
    },
    columnStyles: {
        0: { cellWidth: 15 }, 1: { cellWidth: 10 }, 2: { cellWidth: 15 }, 3: { cellWidth: 12 },
        4: { cellWidth: 35 }, 5: { cellWidth: 15 }, 6: { cellWidth: 12 }, 7: { cellWidth: 45 },
        8: { cellWidth: 45 }, 9: { cellWidth: 15 }, 10: { cellWidth: 'auto' }
    },
    margin: { top: 35, left: 10, right: 10 }
  });

  doc.save(`${activeTab}_OT_List_${selectedDate}.pdf`);
}
