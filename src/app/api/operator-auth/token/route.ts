export const dynamic = 'force-dynamic';

import { readCommissionJson, sanitizeOperator } from '@/lib/commission-api';
import { createOperatorSessionToken, setOperatorSessionCookie } from '@/lib/operator-session';

type OperatorRow = {
  id: string;
  moovs_operator_id: string;
  slug: string;
  display_name: string;
  auth_password?: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export async function POST(request: Request) {
  let body: { slug?: string; token?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const slug = body.slug?.trim().toLowerCase();
  const token = body.token?.trim();
  if (!slug || !token) {
    return Response.json({ error: 'Missing slug or token' }, { status: 400 });
  }

  let operator: OperatorRow;
  try {
    operator = await readCommissionJson<OperatorRow>(
      '/commission-operators/portal-token/verify',
      {
        method: 'POST',
        body: JSON.stringify({ slug, token }),
      },
    );
  } catch {
    return Response.json({ error: 'Invalid token' }, { status: 401 });
  }

  const sessionToken = createOperatorSessionToken({
    operatorId: operator.id,
    moovsOperatorId: operator.moovs_operator_id,
    slug: operator.slug,
    displayName: operator.display_name,
  });
  await setOperatorSessionCookie(sessionToken);

  return Response.json({ operator: sanitizeOperator(operator) });
}
