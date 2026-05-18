export const dynamic = 'force-dynamic';

import { clearOperatorSessionCookie } from '@/lib/operator-session';

export async function POST() {
  await clearOperatorSessionCookie();
  return Response.json({ ok: true });
}
