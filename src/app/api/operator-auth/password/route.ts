export const dynamic = 'force-dynamic';

import { createOperatorSessionToken, setOperatorSessionCookie } from '@/lib/operator-session';
import { hashPassword, isPasswordHash, verifyPassword } from '@/lib/password';
import { readCommissionJson, sanitizeOperator, fetchCommissionApi } from '@/lib/commission-api';

type OperatorRow = {
  id: string;
  moovs_operator_id: string;
  slug: string;
  display_name: string;
  auth_password: string;
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
  let body: { slug?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const slug = body.slug?.trim().toLowerCase();
  const password = body.password ?? '';
  if (!slug || !password) {
    return Response.json({ error: 'Missing slug or password' }, { status: 400 });
  }

  const rows = await readCommissionJson<OperatorRow[]>(
    `/commission-operators?slug=${encodeURIComponent(slug)}`,
  );
  const operator = rows[0];
  if (!operator || operator.status !== 'active' || !verifyPassword(password, operator.auth_password)) {
    return Response.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  // Opportunistically migrate legacy plaintext operator passwords to a one-way hash.
  if (!isPasswordHash(operator.auth_password)) {
    await fetchCommissionApi(`/commission-operators/${encodeURIComponent(operator.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ auth_password: hashPassword(password) }),
    }, true).catch((error) => {
      console.error('Failed to migrate operator password hash:', error);
    });
  }

  const token = createOperatorSessionToken({
    operatorId: operator.id,
    moovsOperatorId: operator.moovs_operator_id,
    slug: operator.slug,
    displayName: operator.display_name,
  });
  await setOperatorSessionCookie(token);

  return Response.json({ operator: sanitizeOperator(operator) });
}
