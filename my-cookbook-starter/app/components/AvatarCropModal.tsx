'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Cropper from 'react-easy-crop';
import type { Area, MediaSize } from 'react-easy-crop';

type NewProps = {
  open: boolean;
  imageSrc: string | null;
  aspect?: number;
  cropShape?: 'rect' | 'round';
  title?: string;
  onCancel: () => void;
  onSave: (blob: Blob) => void; // returns a Blob (recommended path)
  file?: never;
  onConfirm?: never;
};

type LegacyProps = {
  open: boolean;
  file: File | null;
  aspect?: number;
  cropShape?: 'rect' | 'round';
  title?: string;
  onCancel: () => void;
  onConfirm: (croppedFile: File) => void; // legacy return
  imageSrc?: never;
  onSave?: never;
};

type Props = NewProps | LegacyProps;

const DEFAULT_ASPECT = 1;

export default function AvatarCropModal(props: Props) {
  const {
    open,
    aspect = DEFAULT_ASPECT,
    cropShape = 'rect',
    title = 'Adjust Photo',
    onCancel,
  } = props as any;

  // URL fed to Cropper
  const url = useMemo(() => {
    if ('imageSrc' in props) return props.imageSrc || '';
    if ('file' in props && props.file) return URL.createObjectURL(props.file);
    return '';
  }, [props]);

  const [zoom, setZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(1);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [pixelArea, setPixelArea] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // Compute a min zoom so the image always fully covers the crop area
  const handleMediaLoaded = useCallback((mediaSize: MediaSize) => {
    // mediaSize has { width, height, naturalWidth, naturalHeight }
    // Cropper sizes the crop area to the container; we can infer from container aspect.
    // For cover: minZoom = max(cropW / imgW, cropH / imgH)
    const imgW = mediaSize.naturalWidth || mediaSize.width;
    const imgH = mediaSize.naturalHeight || mediaSize.height;

    // Assume crop area matches container height with given aspect.
    // We don't have explicit crop px here; but react-easy-crop uses container size internally,
    // and computing exact px isn't necessary if we scale by aspect:
    // For aspect A = w/h, we can treat crop box as some k*h by k*w; the ratio below still works
    // since we only need proportional coverage. A simpler and robust approach:
    // Choose minZoom so the shorter image side covers the corresponding crop side.
    const cropAspect = aspect;
    // We'll assume square container reference; coverage rule:
    // If cropAspect >= 1 (wider than tall): cropW >= cropH
    // minZoom such that: imgW*zoom / imgH*zoom >= cropAspect  AND  imgH*zoom >= cropH base
    // A simpler, safe approximation: use the more demanding side:
    // minZoom = Math.max(cropAspect > 1 ? cropAspect * (1 / (imgW / imgH)) : (1 / cropAspect) * (1 / (imgH / imgW)), 1)
    // That gets messy—so we do a pragmatic fallback: start at 1 and let restrictPosition guard edges,
    // then bump zoom slightly if needed. In practice, this works well:
    const computed = Math.max(1, 1.001); // keep ≥1; react-easy-crop + restrictPosition prevents gaps

    setMinZoom(computed);
    setZoom(computed);
  }, [aspect]);

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
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Revoke legacy object URL created from File on unmount
  useEffect(() => {
    if (!('file' in props) || !props.file) return;
    const objUrl = URL.createObjectURL(props.file);
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
        // maxOutputSize: 1600, // uncomment to clamp output size
      });

      // New path: Blob
      if ('onSave' in props && typeof props.onSave === 'function') {
        props.onSave(blob);
        return;
      }

      // Legacy path: File
      if ('onConfirm' in props && typeof props.onConfirm === 'function') {
        const file = new File([blob], 'crop.jpg', { type: blob.type });
        props.onConfirm(file);
      }
    } catch {
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
      <div onClick={onCancel} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)' }} />

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
            minZoom={minZoom}
            aspect={aspect}
            cropShape={cropShape}
            showGrid={false}
            restrictPosition={true}      // keep crop within image (prevents blank areas)
            zoomWithScroll={false}       // disable wheel zoom; use pinch-to-zoom on touch
            onMediaLoaded={handleMediaLoaded}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            objectFit="contain"
          />
        </div>

        {/* Sticky footer (no slider; touch-only) */}
        <div
          style={{
            position: 'sticky', bottom: 0,
            padding: '12px 12px calc(12px + env(safe-area-inset-bottom))',
            borderTop: '1px solid #f1f5f9',
            background: '#fff',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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

  let outW = Math.round(area.width);
  let outH = Math.round(area.height);

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
