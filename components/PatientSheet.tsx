/**
 * PatientSheet.tsx — quick view/edit of a patient without leaving the list.
 *
 * Renders the same <PatientDetail> the full `#/patient/:id` route uses, so
 * there is exactly one detail implementation. Open state is driven by the URL
 * (`#/<listView>/<ipNo>`) in App, which keeps Android hardware-back and refresh
 * working. Closing clears the id from the hash.
 */
import React from 'react';
import { Sheet, SheetContent, SheetTitle } from './ui/Sheet';
import PatientDetail from './PatientDetail';

interface Props {
  open: boolean;
  patientId?: string;
  onClose: () => void;
}

const PatientSheet: React.FC<Props> = ({ open, patientId, onClose }) => (
  <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
    <SheetContent side="right" hideClose aria-describedby={undefined}>
      {/* Radix requires a title for a11y; the visible name lives in the header. */}
      <SheetTitle className="sr-only">Patient details</SheetTitle>
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-8">
        {patientId && <PatientDetail patientId={patientId} onClose={onClose} inSheet />}
      </div>
    </SheetContent>
  </Sheet>
);

export default PatientSheet;
