import { config } from '../config/env';

export async function uploadLogo(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${config.apiBaseUrl}/upload-logo`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`uploadLogo: ${res.status} - ${body}`);
  }

  const { url } = await res.json() as { url: string };
  return url;
}
