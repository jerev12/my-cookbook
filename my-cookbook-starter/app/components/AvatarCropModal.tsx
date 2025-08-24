'use client';

import { useCallback, useMemo, useState } from 'react';
import Cropper from 'react-easy-crop';
import { fileToImage, getCroppedImageDataURL, dataUrlToFile } from './image-utils';

type Props = {
  open: boolean;
  file: File | null;
  onCancel: () => void;
  onConfirm: (croppedFile: File) => void;
};

export default function AvatarCropModal({ open, file, onCancel, onConfirm }: Props) {
  const [zoom, setZoom] = useState(1);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [pixelArea, setPixelArea] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const url = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);

  const onCropComplete = useCallback((_area, areaPixels) => {
    setPixelArea({
      x: Math.round(areaPixels.x),
      y: Math.round(areaPixels.y),
      width: Math.round(areaPixels.width),
      height: Math.round(areaPixels.height),
    });
  }, []);

  async function handleConfirm() {
    if (!file || !pixelArea) return;
    const img = await fileToImage(file);
    const dataUrl = getCroppedImageDataURL(img, pixelArea, 512);
    const out = await dataUrlToFile(dataUrl, 'avatar.png');
    onConfirm(out);
  }

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      aria-modal="true" role="dialog"
    >
      {/* Backdrop */}
      <div
        onClick={onCancel}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.4)' }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'relative', zIndex: 101, width: 'min(92vw, 640px)',
          background: '#fff', borderRadius: 12, padding: 16,
          boxShadow: '0 10px 30px rgba(0,0,0,.2)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 700 }}>Crop your avatar</div>
          <button
            onClick={onCancel}
            aria-label="Close"
            style={{ border: '1px solid #ddd', borderRadius: 6, padding: '4px 8px', background: '#fff' }}
          >
            ✕
          </button>
        </div>

        <div style={{ position: 'relative', width: '100%', height: 360, background: '#111', borderRadius: 8, overflow: 'hidden' }}>
          <Cropper
            image={url}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"      // visual circle mask
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            objectFit="contain"
          />
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
          <label style={{ fontSize: 13, color: '#555' }}>Zoom</label>
          <input
            type="range"
            min={1} max={3} step={0.01}
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            style={{ flex: 1 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button
            onClick={onCancel}
            style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: 6, background: '#fff' }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            style={{ padding: '6px 12px', borderRadius: 6, background: '#111', color: '#fff' }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
