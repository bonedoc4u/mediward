/**
 * ImageEditor.tsx — crop / rotate / straighten a radiology image before upload.
 * Cropper.js via react-cropper: free-form crop box, pinch-zoom and drag on
 * touch, arbitrary rotation for aligning skewed ward photos of films.
 * Output is a JPEG File handed back to the upload flow (which compresses it).
 */
import React, { useRef, useState } from 'react';
import Cropper, { ReactCropperElement } from 'react-cropper';
import 'cropperjs/dist/cropper.css';
import { X, Check, RotateCcw, RotateCw, RefreshCw, Loader2 } from 'lucide-react';

interface Props {
  /** Object/blob URL of the image being edited. */
  src: string;
  onApply: (file: File) => void;
  onClose: () => void;
}

const ImageEditor: React.FC<Props> = ({ src, onApply, onClose }) => {
  const cropperRef = useRef<ReactCropperElement>(null);
  // Whole-degree base (90° steps) + fine slider for straightening.
  const [baseRotation, setBaseRotation] = useState(0);
  const [fineRotation, setFineRotation] = useState(0);
  const [applying, setApplying] = useState(false);

  const rotateTo = (base: number, fine: number) => {
    cropperRef.current?.cropper.rotateTo(base + fine);
  };

  const rotate90 = (dir: 1 | -1) => {
    const next = (baseRotation + dir * 90) % 360;
    setBaseRotation(next);
    rotateTo(next, fineRotation);
  };

  const onFineChange = (v: number) => {
    setFineRotation(v);
    rotateTo(baseRotation, v);
  };

  const reset = () => {
    setBaseRotation(0);
    setFineRotation(0);
    cropperRef.current?.cropper.reset();
  };

  const apply = () => {
    const cropper = cropperRef.current?.cropper;
    if (!cropper || applying) return;
    setApplying(true);
    const canvas = cropper.getCroppedCanvas({
      maxWidth: 2400,
      maxHeight: 2400,
      imageSmoothingQuality: 'high',
      fillColor: '#000',
    });
    canvas.toBlob(blob => {
      if (!blob) { setApplying(false); return; }
      onApply(new File([blob], `scan_edited_${Date.now()}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Edit image" className="fixed inset-0 z-[120] flex flex-col bg-slate-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cancel editing"
          className="p-2 rounded-full text-slate-300 hover:text-white hover:bg-white/10"
        >
          <X className="w-5 h-5" />
        </button>
        <p className="text-sm font-semibold text-white">Crop &amp; straighten</p>
        <button
          type="button"
          onClick={reset}
          aria-label="Reset edits"
          className="p-2 rounded-full text-slate-300 hover:text-white hover:bg-white/10"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Cropper canvas */}
      <div className="flex-1 min-h-0 px-2">
        <Cropper
          ref={cropperRef}
          src={src}
          style={{ height: '100%', width: '100%' }}
          viewMode={1}
          dragMode="move"
          autoCropArea={0.9}
          background={false}
          responsive
          checkOrientation
          guides
        />
      </div>

      {/* Controls */}
      <div className="shrink-0 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] space-y-3">
        {/* Straighten slider */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => rotate90(-1)}
            aria-label="Rotate 90° left"
            className="p-2.5 rounded-xl bg-white/10 text-white hover:bg-white/20 min-h-[44px] min-w-[44px]"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
          <input
            type="range"
            min={-45}
            max={45}
            step={1}
            value={fineRotation}
            onChange={e => onFineChange(Number(e.target.value))}
            aria-label="Straighten (fine rotation)"
            className="flex-1 accent-teal-400"
          />
          <button
            type="button"
            onClick={() => rotate90(1)}
            aria-label="Rotate 90° right"
            className="p-2.5 rounded-xl bg-white/10 text-white hover:bg-white/20 min-h-[44px] min-w-[44px]"
          >
            <RotateCw className="w-5 h-5" />
          </button>
        </div>
        <p className="text-center text-[11px] text-slate-400 -mt-1">
          {fineRotation !== 0 ? `${fineRotation > 0 ? '+' : ''}${fineRotation}°` : 'Drag to move · pinch to zoom · handles to crop'}
        </p>

        <button
          type="button"
          onClick={apply}
          disabled={applying}
          className="w-full py-3.5 bg-teal-500 hover:bg-teal-400 disabled:opacity-60 text-white text-sm font-bold rounded-2xl flex items-center justify-center gap-2"
        >
          {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {applying ? 'Applying…' : 'Apply'}
        </button>
      </div>
    </div>
  );
};

export default ImageEditor;
