export const dynamic = 'force-dynamic';

export async function POST() {
  return Response.json({ error: 'Password login disabled. Use a secure portal link.' }, { status: 410 });
}
