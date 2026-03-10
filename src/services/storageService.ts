import { config } from '../config/env';

const STORAGE_BUCKET = 'operator-logos';

export async function uploadLogo(file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'png';
  const path = `logos/${crypto.randomUUID()}.${ext}`;
  const url = `${config.supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${path}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`,
      'Content-Type': file.type,
    },
    body: file,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`uploadLogo: ${res.status} — ${body}`);
  }

  // Return public URL
  return `${config.supabaseUrl}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
}
