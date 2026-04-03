import { Hono } from 'hono';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const upload = new Hono();

const BUCKET = process.env.S3_BUCKET || 'moovs-prototype-data';
const REGION = process.env.S3_REGION || 'us-east-2';
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

const s3 = new S3Client({ region: REGION });

// POST /upload-logo
upload.post('/upload-logo', async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;

  if (!file) return c.json({ error: 'No file provided' }, 400);
  if (file.size > MAX_SIZE) return c.json({ error: 'File exceeds 5MB limit' }, 400);

  const allowed = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']);
  if (!allowed.has(file.type)) {
    return c.json({ error: `File type "${file.type}" is not allowed` }, 400);
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9.\-]/g, '_');
  const key = `commissions/logos/${Date.now()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: file.type,
    }),
  );

  const url = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
  return c.json({ url, key }, 201);
});

export default upload;
