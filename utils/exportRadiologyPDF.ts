import jsPDF from 'jspdf';
import { Capacitor } from '@capacitor/core';
import { resolveImageUrl } from '../services/storageService';

interface ScanForExport {
  type: string;
  region?: string;
  date: string;
  imageUrl: string;
  notes?: string;
}

interface PatientForExport {
  name: string;
  age: number;
  gender: string;
  ipNo: string;
  ward: string;
  diagnosis: string;
  dos?: string;
}

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 12;

function drawPageHeader(
  pdf: jsPDF,
  patient: PatientForExport,
  phase: 'PreOp' | 'PostOp',
  phaseRgb: [number, number, number],
) {
  pdf.setFillColor(15, 23, 42);
  pdf.rect(0, 0, PAGE_W, 22, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text(patient.name, MARGIN, 10);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(148, 163, 184);
  pdf.text(
    `${patient.age}y ${patient.gender} · IP: ${patient.ipNo} · ${patient.ward} · ${patient.diagnosis}`,
    MARGIN, 17,
    { maxWidth: PAGE_W - MARGIN * 2 - 34 },
  );

  pdf.setFillColor(...phaseRgb);
  pdf.roundedRect(PAGE_W - MARGIN - 30, 6, 30, 10, 2, 2, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  pdf.text(phase === 'PreOp' ? 'PRE-OP' : 'POST-OP', PAGE_W - MARGIN - 15, 12.5, { align: 'center' });
}

function drawPageFooter(pdf: jsPDF, pageNum: number, totalPages: number) {
  const dateStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(148, 163, 184);
  pdf.text(`MediWard · ${dateStr}`, MARGIN, PAGE_H - 4);
  pdf.text(`${pageNum} / ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 4, { align: 'right' });
}

export async function exportRadiologyPDF(
  patient: PatientForExport,
  scans: ScanForExport[],
  phase: 'PreOp' | 'PostOp',
  onProgress?: (pct: number) => void,
): Promise<void> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const phaseRgb: [number, number, number] = phase === 'PreOp' ? [29, 78, 216] : [13, 148, 136];

  for (let i = 0; i < scans.length; i++) {
    onProgress?.(Math.round((i / scans.length) * 88));
    const scan = scans[i];
    if (i > 0) pdf.addPage();

    // ── Header strip (same on every page) ──────────────────────────────
    drawPageHeader(pdf, patient, phase, phaseRgb);

    // ── Scan label strip ───────────────────────────────────────────────
    const labelY = 26;
    const fmtDate = new Date(scan.date).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
    pdf.setTextColor(15, 23, 42);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(scan.region || scan.type, MARGIN, labelY + 6);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`${scan.type} · ${fmtDate}`, MARGIN, labelY + 13);

    // ── Image area (fills rest of page, preserving aspect ratio) ───────
    const imgAreaTop = labelY + 18;
    const imgAreaH   = PAGE_H - imgAreaTop - 10; // 10mm footer
    const imgAreaW   = PAGE_W - 2 * MARGIN;

    const imageUrl = scan.imageUrl ? await resolveImageUrl(scan.imageUrl) : null;
    if (imageUrl) {
      try {
        const response = await fetch(imageUrl);
        const blob     = await response.blob();
        const base64   = await new Promise<string>(resolve => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(blob);
        });
        const ext     = blob.type === 'image/png' ? 'PNG' : 'JPEG';
        const imgData = `data:image/${ext.toLowerCase()};base64,${base64}`;

        // Intrinsic dimensions from jsPDF for accurate aspect ratio
        const props   = pdf.getImageProperties(imgData);
        const natW    = props.width;
        const natH    = props.height;

        // Scale to fit imgAreaW × imgAreaH, maintain aspect ratio
        let drawW = imgAreaW;
        let drawH = (natH / natW) * drawW;
        if (drawH > imgAreaH) {
          drawH = imgAreaH;
          drawW = (natW / natH) * drawH;
        }

        // Center within the image area
        const imgX = MARGIN + (imgAreaW - drawW) / 2;
        const imgY = imgAreaTop + (imgAreaH - drawH) / 2;

        pdf.addImage(imgData, ext, imgX, imgY, drawW, drawH);
      } catch {
        // Fetch/decode failed — draw a dark placeholder
        pdf.setFillColor(15, 23, 42);
        pdf.rect(MARGIN, imgAreaTop, imgAreaW, imgAreaH, 'F');
        pdf.setTextColor(148, 163, 184);
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text(scan.type, PAGE_W / 2, imgAreaTop + imgAreaH / 2, { align: 'center' });
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');
        pdf.text('Image unavailable', PAGE_W / 2, imgAreaTop + imgAreaH / 2 + 8, { align: 'center' });
      }
    } else {
      pdf.setFillColor(241, 245, 249);
      pdf.rect(MARGIN, imgAreaTop, imgAreaW, imgAreaH, 'F');
      pdf.setTextColor(148, 163, 184);
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('No image uploaded', PAGE_W / 2, imgAreaTop + imgAreaH / 2, { align: 'center' });
    }
  }

  // ── Add footers now that page count is known ────────────────────────
  const totalPages = pdf.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    drawPageFooter(pdf, p, totalPages);
  }

  onProgress?.(95);

  const fileName = `${patient.name.replace(/\s+/g, '_')}_${phase}.pdf`;

  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const base64PDF = pdf.output('datauristring').split(',')[1];
    const saved = await Filesystem.writeFile({ path: fileName, data: base64PDF, directory: Directory.Cache });
    onProgress?.(100);
    await Share.share({
      title: fileName,
      text: `${patient.name} – ${phase === 'PreOp' ? 'Pre-Operative' : 'Post-Operative'} Radiology`,
      url: saved.uri,
      dialogTitle: 'Share via WhatsApp',
    });
  } else {
    pdf.save(fileName);
    onProgress?.(100);
  }
}
