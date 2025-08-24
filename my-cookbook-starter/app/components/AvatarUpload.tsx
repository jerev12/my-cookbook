'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Props = {
  userId: string;
  currentUrl?: string | null;
  onUploaded: (url: string) => void;
};

export default function AvatarUpload({ userId, currentUrl, onUploaded }: Props) {
  const [uploading, setUploading] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    try {
      setUploading(true);
      const file = e.target.files?.[0];
      if (!file) return;

      const ext = file.name.split('.').pop();
      const filePath = `${userId}/${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (upErr) throw upErr;

      // Using public bucket: get the public URL
      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      onUploaded(data.publicUrl);
    } catch (err) {
      console.error(err);
      alert('Avatar upload failed.');
    } finally {
      setUploading(false);
      // clear input so the same file can be selected again if needed
      e.currentTarget.value = '';
    }
  }

  return (
    <div className="flex items-center gap-3">
      <img
        src={currentUrl || '/avatar-placeholder.png'}
        alt="avatar"
        className="h-14 w-14 rounded-full object-cover border"
      />
      <label className="text-sm">
        <span className="mb-1 block font-medium">Profile picture</span>
        <input
          type="file"
          accept="image/*"
          onChange={handleChange}
          disabled={uploading}
        />
      </label>
    </div>
  );
}
