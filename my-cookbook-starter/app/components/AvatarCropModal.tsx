'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';

type Props =
  | {
      /** New, recommended: pass an image URL/ObjectURL */
      open: boolean;
      imageSrc: string | null;
      aspect?: number;
      cropShape?: 'rect' | 'round';
      title?: string;
      onCancel: () => void;
      /** Returns a Blob (e.g. upload directly to Supabase) */
      onSave: (blob: Blob) => void;
      /** Legacy props omitted in this branch */
      file?: never;
      onConfirm?: never;
    }
  | {
      /** Legacy: pass a File (kept for backward compatibility) */
      open: boolean;
      file: File | null;
      aspect?: number;
      cropShape?: 'rect' | 'round';
      title?: string;
      onCancel: () => void;
      /** Returns a File (old usage) */
      onConfirm: (croppedFile: File) => void;
      /** New props omitted in this branch */
      imageSrc?: never;
      onSave?: never;
    };

const DEFAULT_ASPECT = 1;

export default function AvatarCropModal(props: Props) {
  const {
    open,
    aspect = DEFAULT_ASPECT,
    cropShape = 'rect',
    title = 'Adjust Photo',
    onCancel,
  } = props as any;

  // URL to show in Cropper
  const url = useMemo(() => {
    if ('imageSrc' in props) return props.imageSrc || '';
    if ('file' in props && props.file) return URL.createObjectURL(props.file);
    return '';
  }, [props]);

  const [zoom, setZoom] = useState(1);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [pixelArea, setPixelArea] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setPixelArea({
      x: Math.round(areaPixels.x),
      y: Math.round(areaPixels.y),
      width: Math.round(areaPixels.width),
      height: Math.round(areaPixels.height),
    });
  }, []);

  // Lock background scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Revoke legacy object URL created from File
  useEffect(() => {
    if (!('file' in props)) return;
    const f = props.file;
    if (!f) return;
    const objUrl = URL.createObjectURL(f); // created above in url memo as well
    return () => {
      try { URL.revokeObjectURL(objUrl); } catch {}
    };
  }, [props]);

  async function handleSave() {
    if (!url || !pixelArea) return;
    try {
      const blob = await cropToBlob(url, pixelArea, {
        mimeType: 'image/jpeg',
        quality: 0.92,
        // You can clamp the output size if you want, e.g. max 1600px
        // maxOutputSize: 1600,
      });

      // New path: return Blob
      if ('onSave' in props && typeof props.onSave === 'function') {
        props.onSave(blob);
        return;
      }

      // Legacy path: return File
      if ('onConfirm' in props && typeof props.onConfirm === 'function') {
        const file = new File([blob], 'crop.jpg', { type: blob.type });
        props.onConfirm(file);
      }
    } catch (e) {
      // no-op
    }
  }

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'grid', placeItems: 'center', padding: 12,
      }}
      aria-modal="true" role="dialog"
    >
      {/* Backdrop */}
      <div
        onClick={onCancel}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)' }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'relative', zIndex: 1001, width: 'min(92vw, 640px)',
          background: '#fff', borderRadius: 12, overflow: 'hidden',
          border: '1px solid #e5e7eb', display: 'grid',
          gridTemplateRows: 'auto 1fr auto', maxHeight: '90vh',
          boxShadow: '0 10px 30px rgba(0,0,0,.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: 12, borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700 }}>{title}</div>
          <button
            onClick={onCancel}
            aria-label="Close"
            style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', background: '#fff' }}
          >
            ✕
          </button>
        </div>

        {/* Cropper area */}
        <div style={{ position: 'relative', background: '#0b0b0c', height: '60vh', minHeight: 260 }}>
          <Cropper
            image={url}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            cropShape={cropShape}
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            restrictPosition={false}
            objectFit="contain"
          />
        </div>

        {/* Sticky footer with safe-area padding */}
        <div
          style={{
            position: 'sticky', bottom: 0,
            padding: '12px 12px calc(12px + env(safe-area-inset-bottom))',
            borderTop: '1px solid #f1f5f9',
            background: '#fff',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'center' }}>
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ fontSize: 13, color: '#555' }}>Zoom</label>
              <input
                type="range"
                min={1} max={3} step={0.01}
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                style={{ flex: 1 }}
              />
            </div>
            <button
              onClick={onCancel}
              style={{ padding: '10px 12px', border: '1px solid #e5e7eb', background: '#fff', borderRadius: 8 }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              style={{ padding: '10px 12px', borderRadius: 8, background: '#111827', color: '#fff', border: 'none' }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Crop a region from an image URL into a Blob using canvas. */
async function cropToBlob(
  imageUrl: string,
  area: { x: number; y: number; width: number; height: number },
  opts?: { mimeType?: string; quality?: number; maxOutputSize?: number }
): Promise<Blob> {
  const img = await loadImage(imageUrl);

  // Create an offscreen canvas sized to the crop
  let outW = Math.round(area.width);
  let outH = Math.round(area.height);

  // Optionally clamp the size (keeps memory low on huge photos)
  const maxSide = opts?.maxOutputSize ?? 0;
  if (maxSide > 0) {
    const scale = Math.min(1, maxSide / Math.max(outW, outH));
    outW = Math.max(1, Math.round(outW * scale));
    outH = Math.max(1, Math.round(outH * scale));
  }

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d')!;

  ctx.drawImage(
    img,
    area.x, area.y, area.width, area.height,
    0, 0, outW, outH
  );

  const mime = opts?.mimeType ?? 'image/jpeg';
  const quality = opts?.quality ?? 0.92;

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('Failed to export crop'));
      resolve(blob);
    }, mime, quality);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
}
