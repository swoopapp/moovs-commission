export const dynamic = 'force-dynamic';

import { getAdminSecret, getCommissionApiBase, getDashboardSecret, requireAuthResponse } from '@/lib/admin-auth';

type CommissionProxyContext = {
  params: Promise<{ path?: string[] }>;
};

function isAdminOnlyRequest(path: string, request: Request): boolean {
  const url = new URL(request.url);

  if (path === 'commission-operators') {
    if (request.method !== 'GET') return true;
    return !url.searchParams.has('slug');
  }

  if (path.startsWith('commission-operators/')) return true;
  if (path === 'upload-logo') return true;
  if (path === 'migrate-data') return true;
  if (path === 'debug-query' || path === 'debug-schema') return true;
  if (path === 'fetch-operators' && url.searchParams.has('operator_id')) return true;

  return false;
}

async function proxyCommissionApi(request: Request, context: CommissionProxyContext) {
  const { path = [] } = await context.params;
  const pathText = path.join('/');

  const adminOnly = isAdminOnlyRequest(pathText, request);
  if (adminOnly) {
    const denied = await requireAuthResponse();
    if (denied) return denied;
  }

  let apiBase: string;
  let dashboardSecret: string;
  let adminSecret: string | null = null;
  try {
    apiBase = getCommissionApiBase();
    dashboardSecret = getDashboardSecret();
    if (adminOnly) adminSecret = getAdminSecret();
  } catch {
    return Response.json({ error: 'Commission API proxy not configured' }, { status: 503 });
  }

  const requestUrl = new URL(request.url);
  const targetUrl = new URL(`${apiBase}/${path.map(encodeURIComponent).join('/')}`);
  targetUrl.search = requestUrl.search;

  const headers = new Headers({
    'x-dashboard-secret': dashboardSecret,
  });
  if (adminSecret) headers.set('x-admin-secret', adminSecret);

  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);

  const accept = request.headers.get('accept');
  if (accept) headers.set('accept', accept);

  const authorization = request.headers.get('authorization');
  if (authorization) headers.set('authorization', authorization);

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: 'no-store',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(targetUrl, init);
  const responseHeaders = new Headers({ 'Cache-Control': 'no-store' });
  const upstreamContentType = upstream.headers.get('content-type');
  if (upstreamContentType) responseHeaders.set('content-type', upstreamContentType);

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204 });
}

export async function GET(request: Request, context: CommissionProxyContext) {
  return proxyCommissionApi(request, context);
}

export async function POST(request: Request, context: CommissionProxyContext) {
  return proxyCommissionApi(request, context);
}

export async function PATCH(request: Request, context: CommissionProxyContext) {
  return proxyCommissionApi(request, context);
}

export async function DELETE(request: Request, context: CommissionProxyContext) {
  return proxyCommissionApi(request, context);
}
