'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import AvatarCropModal from './AvatarCropModal';

type Props = {
  userId: string;
  currentUrl?: string | null;
  onUploaded: (url: string) => void;
};

const MAX_FILE_MB = 8;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export default function AvatarUpload({ userId, currentUrl, onUploaded }: Props) {
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [openCrop, setOpenCrop] = useState(false);
  const [uploading, setUploading] = useState(false);

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    e.currentTarget.value = ''; // allow re-selecting the same file

    if (!file) return;

    if (!ACCEPTED.includes(file.type)) {
      alert('Please choose an image (jpg, png, webp, gif).');
      return;
    }
    const maxBytes = MAX_FILE_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      alert(`Image is too large. Max size is ${MAX_FILE_MB} MB.`);
      return;
    }

    setPendingFile(file);
    setOpenCrop(true);
  }

  async function handleCroppedReady(cropped: File) {
    try {
      setUploading(true);
      setOpenCrop(false);

      // Always overwrite the same path so there's only ONE avatar per user
      const filePath = `${userId}/avatar.png`;

      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(filePath, cropped, { upsert: true, contentType: 'image/png' });

      if (upErr) throw upErr;

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      onUploaded(data.publicUrl);
    } catch (err) {
      console.error(err);
      alert('Avatar upload failed.');
    } finally {
      setUploading(false);
      setPendingFile(null);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {/* Circular avatar preview */}
      <img
        src={currentUrl || '/avatar-placeholder.png'}
        alt="avatar"
        style={{
          width: 220, height: 220, borderRadius: '50%',
          objectFit: 'cover', border: '1px solid #ddd', background: '#f5f5f5',
        }}
      />

      {/* Controls */}
      <div>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Profile picture</div>
        <input type="file" accept="image/*" onChange={handlePick} disabled={uploading} />
        {uploading && (
          <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>Uploading…</div>
        )}
      </div>

      {/* Crop modal */}
      <AvatarCropModal
        open={openCrop}
        file={pendingFile}
        onCancel={() => { setOpenCrop(false); setPendingFile(null); }}
        onConfirm={handleCroppedReady}
      />
    </div>
  );
}
