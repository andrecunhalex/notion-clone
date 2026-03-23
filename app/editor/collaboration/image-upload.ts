import { SupabaseClient } from '@supabase/supabase-js';
import { generateId } from '../utils';

const BUCKET = 'document-images';

/**
 * Upload an image file to Supabase Storage.
 * Returns the public URL, or null on failure.
 */
export async function uploadImage(
  supabase: SupabaseClient,
  documentId: string,
  file: File,
): Promise<string | null> {
  const ext = file.name.split('.').pop() || 'png';
  const path = `${documentId}/${generateId()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: '31536000', // 1 year — images are immutable
      contentType: file.type,
    });

  if (error) {
    console.warn('[image-upload] Failed:', error.message);
    return null;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Upload from a base64 data URL (for migration of existing inline images).
 * Returns the public URL, or null on failure.
 */
export async function uploadBase64Image(
  supabase: SupabaseClient,
  documentId: string,
  dataUrl: string,
): Promise<string | null> {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;

  const contentType = match[1];
  const base64 = match[2];
  const ext = contentType.split('/')[1] || 'png';
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: contentType });

  const path = `${documentId}/${generateId()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, {
      cacheControl: '31536000',
      contentType,
    });

  if (error) {
    console.warn('[image-upload] Failed:', error.message);
    return null;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
