export const dynamic = 'force-dynamic';

import { getOperatorSession } from '@/lib/operator-session';

export async function GET() {
  const session = await getOperatorSession();
  if (!session) return Response.json({ authenticated: false }, { status: 401 });
  return Response.json({ authenticated: true, operator: session });
}
