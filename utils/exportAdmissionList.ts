/**
 * exportAdmissionList.ts — printable admission register for one source
 * section (OPD/Casualty) on a given date. A4 portrait via jsPDF + autotable,
 * same native-share/web-download split as exportWardList.ts and
 * exportRadiologyPDF.ts — the previous window.open()+window.print()
 * approach doesn't work reliably inside the Capacitor mobile WebView.
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';
import { Patient } from '../types';

interface ExportOptions {
  source: string;
  patients: Patient[];
  /** Pre-formatted display date, e.g. "26/07/2026". */
  dateLabel: string;
  unit?: string;
}

const PAGE_W = 210; // A4 portrait, mm
const MARGIN = 12;

export async function exportAdmissionListPDF(opts: ExportOptions): Promise<void> {
  const { source, patients, dateLabel, unit } = opts;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(15, 118, 110);
  doc.text(`MediWard — ${source} Admission List`, MARGIN, 16);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(100);
  doc.text(
    `${dateLabel}${unit ? ` · ${unit}` : ''} · ${patients.length} patient${patients.length === 1 ? '' : 's'}`,
    MARGIN, 22,
  );

  const rows = patients.map((p, idx) => [
    String(idx + 1),
    p.ipNo,
    p.name,
    `${p.age} / ${p.gender?.[0] ?? ''}`,
    p.diagnosis || '—',
    p.mobile || '—',
  ]);

  autoTable(doc, {
    head: [['Sl', 'IP No', 'Name', 'Age/Sex', 'Diagnosis', 'Mobile']],
    body: rows,
    startY: 28,
    margin: { left: MARGIN, right: MARGIN },
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 2.5,
      textColor: [30, 41, 59],
      overflow: 'linebreak',
    },
    headStyles: { fillColor: [15, 118, 110], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },  // Sl
      1: { cellWidth: 22 },                     // IP No
      2: { cellWidth: 38, fontStyle: 'bold' },  // Name
      3: { cellWidth: 18, halign: 'center' },   // Age/Sex
      4: { cellWidth: 58 },                     // Diagnosis
      5: { cellWidth: 30 },                     // Mobile
    },
  });

  doc.setFontSize(7).setTextColor(150);
  doc.text(`Printed from MediWard · ${new Date().toLocaleString('en-IN')}`, PAGE_W - MARGIN, 287, { align: 'right' });

  const safeSource = source.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const now = new Date();
  // Local date, not toISOString() — UTC lags IST before 05:30.
  const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const fileName = `admission-list-${safeSource}-${ymd}.pdf`;

  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const base64PDF = doc.output('datauristring').split(',')[1];
    const saved = await Filesystem.writeFile({ path: fileName, data: base64PDF, directory: Directory.Cache });
    await Share.share({
      title: fileName,
      text: `${source} admission list — ${dateLabel}`,
      url: saved.uri,
      dialogTitle: 'Share admission list',
    });
  } else {
    doc.save(fileName);
  }
}
