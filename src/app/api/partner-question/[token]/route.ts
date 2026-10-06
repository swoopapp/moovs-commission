import { fetchCommissionApi } from '@/lib/commission-api';
import {
  getDemoAgencyByPortalToken,
  getDemoAgentByPortalToken,
} from '@/demoData';
export const dynamic = 'force-dynamic';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  const { token } = await params;
  if (getDemoAgencyByPortalToken(token) || getDemoAgentByPortalToken(token))
    return Response.json({ error: 'Demo is read-only' }, { status: 403 });
  if (Number(request.headers.get('content-length') ?? 0) > 12000)
    return Response.json({ error: 'Question too large' }, { status: 413 });
  const b = await request.json().catch(() => null);
  if (
    !b ||
    typeof b.message !== 'string' ||
    b.message.length > 2000 ||
    typeof b.moovs_trip_id !== 'string' ||
    b.moovs_trip_id.length > 100
  )
    return Response.json({ error: 'Invalid question' }, { status: 400 });
  try {
    const upstream = await fetchCommissionApi('/internal/partner-question', {
      method: 'POST',
      body: JSON.stringify({
        token,
        message: b.message,
        moovs_trip_id: b.moovs_trip_id,
        request_key: b.request_key,
      }),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'content-type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return Response.json(
      { error: 'Questions temporarily unavailable' },
      { status: 503 },
    );
  }
}
