/**
 * exportWardList.ts — printable IP patient list, one row per patient with a
 * blank Notes area on the right for handwriting during rounds.
 *
 * A4 landscape via jsPDF + autotable. Each ward starts on a new page with its
 * own heading. On Android/iOS the PDF is written to cache and opened in the
 * native share sheet (same pattern as exportRadiologyPDF); on web it downloads.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';
import { Patient } from '../types';
import { sortByBed } from './calculations';

export interface WardSection {
  name: string;
  patients: Patient[];
}

interface ExportOptions {
  sections: WardSection[];
  hospitalName?: string;
  department?: string;
  /** 'All' or a ward name — used only for the file name. */
  scopeLabel: string;
}

const PAGE_W = 297; // A4 landscape, mm
const MARGIN = 10;

/** "10-05" → "05" (same display rule as the dashboard). */
const shortBed = (bed: string) => (bed.includes('-') ? bed.split('-').pop()! : bed);

export async function exportWardListPDF(opts: ExportOptions): Promise<void> {
  const { sections, hospitalName, department, scopeLabel } = opts;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  sections.forEach((section, sectionIdx) => {
    if (sectionIdx > 0) doc.addPage();

    // ── Ward heading ────────────────────────────────────────────────────
    let y = MARGIN + 2;
    doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(15, 118, 110);
    doc.text(`${section.name.toUpperCase()} — IP PATIENT LIST`, MARGIN, y);
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(100);
    doc.text(`${dateStr}  ·  ${section.patients.length} patient${section.patients.length === 1 ? '' : 's'}`, PAGE_W - MARGIN, y, { align: 'right' });
    if (hospitalName || department) {
      y += 5;
      doc.setFontSize(8).setTextColor(120);
      doc.text([hospitalName, department].filter(Boolean).join('  ·  '), MARGIN, y);
    }

    const rows = [...section.patients].sort(sortByBed).map(p => [
      shortBed(p.bed),
      `${p.name}\nIP ${p.ipNo}`,
      `${p.age} / ${p.gender?.[0] ?? ''}`,
      '', // Notes — blank space to write in
    ]);

    autoTable(doc, {
      head: [['Bed', 'Name / IP No', 'Age/Sex', 'Notes']],
      body: rows,
      startY: y + 4,
      margin: { left: MARGIN, right: MARGIN, top: MARGIN + 12 },
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 8.5,
        cellPadding: 2,
        lineColor: [120, 120, 120],
        lineWidth: 0.15,
        textColor: [20, 20, 20],
        valign: 'top',
        overflow: 'linebreak',
        minCellHeight: 16, // vertical room to write in the Notes column
      },
      headStyles: {
        fillColor: [15, 118, 110],
        textColor: 255,
        fontSize: 8.5,
        fontStyle: 'bold',
        valign: 'middle',
        minCellHeight: 7,
      },
      columnStyles: {
        0: { cellWidth: 15, halign: 'center', fontStyle: 'bold' }, // Bed
        1: { cellWidth: 55 },                                      // Name / IP
        2: { cellWidth: 18, halign: 'center' },                    // Age/Sex
        // Notes takes the remaining ~189mm of the printable width
      },
      didParseCell: data => {
        // Patient name bold, IP number lighter (both share one cell)
        if (data.section === 'body' && data.column.index === 1) {
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });
  });

  // ── Page footer ───────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(150);
    doc.text(`Generated ${dateStr} · MediWard`, MARGIN, 205);
    doc.text(`Page ${i} of ${pageCount}`, PAGE_W - MARGIN, 205, { align: 'right' });
  }

  const safeScope = scopeLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  // Local date, not toISOString() — UTC lags IST before 05:30.
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const fileName = `ward-list-${safeScope}-${ymd}.pdf`;

  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const base64PDF = doc.output('datauristring').split(',')[1];
    const saved = await Filesystem.writeFile({ path: fileName, data: base64PDF, directory: Directory.Cache });
    await Share.share({
      title: fileName,
      text: `IP patient list — ${scopeLabel} (${dateStr})`,
      url: saved.uri,
      dialogTitle: 'Share ward list',
    });
  } else {
    doc.save(fileName);
  }
}
