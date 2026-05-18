export const dynamic = 'force-dynamic';

import { getAdminSecret, getCommissionApiBase, getDashboardSecret, requireAuthResponse } from '@/lib/admin-auth';
import { sanitizeOperator } from '@/lib/commission-api';
import { getOperatorSession } from '@/lib/operator-session';
import { hashPassword } from '@/lib/password';

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

function isPublicRequest(path: string, request: Request): boolean {
  const url = new URL(request.url);
  return (
    path === 'health' ||
    (path === 'commission-operators' && request.method === 'GET' && url.searchParams.has('slug'))
  );
}

async function hasAdminAuth(): Promise<boolean> {
  return (await requireAuthResponse()) === null;
}

async function authorizeProxyRequest(path: string, request: Request, adminOnly: boolean): Promise<Response | null> {
  if (adminOnly) return requireAuthResponse();
  if (isPublicRequest(path, request)) return null;
  if (await hasAdminAuth()) return null;

  const session = await getOperatorSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);

  if (path === 'agencies' && request.method === 'GET') {
    const operatorId = url.searchParams.get('operator_id');
    if (operatorId !== session.operatorId) return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (path === 'agencies' && request.method === 'POST') {
    const body = await request.clone().json().catch(() => null);
    if (body?.operator_id !== session.operatorId) return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (path.startsWith('agencies/linked-companies/')) {
    const operatorId = path.split('/')[2];
    if (operatorId !== session.operatorId) return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (path === 'commission-reservations') {
    const operatorId = url.searchParams.get('operator_id');
    if (operatorId !== session.operatorId) return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (path === 'payouts' && request.method === 'GET') {
    const operatorId = url.searchParams.get('operator_id');
    if (operatorId && operatorId !== session.operatorId) return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (path === 'payouts' && request.method === 'POST') {
    const body = await request.clone().json().catch(() => null);
    if (body?.operator_id !== session.operatorId) return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  return null;
}

async function prepareRequestBody(path: string, request: Request, adminOnly: boolean): Promise<BodyInit | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;

  const contentType = request.headers.get('content-type') || '';
  if (
    contentType.includes('application/json') &&
    path.startsWith('commission-operators') &&
    (request.method === 'POST' || request.method === 'PATCH')
  ) {
    const body = await request.clone().json().catch(() => null);
    if (body && typeof body.auth_password === 'string' && body.auth_password.trim()) {
      body.auth_password = hashPassword(body.auth_password);
      return Buffer.from(JSON.stringify(body));
    }
    if (adminOnly && body && body.auth_password === '') {
      delete body.auth_password;
      return Buffer.from(JSON.stringify(body));
    }
  }

  return request.arrayBuffer();
}

async function sanitizeResponse(path: string, request: Request, upstream: Response): Promise<Response> {
  const responseHeaders = new Headers({ 'Cache-Control': 'no-store' });
  const upstreamContentType = upstream.headers.get('content-type');
  if (upstreamContentType) responseHeaders.set('content-type', upstreamContentType);

  const shouldSanitizeOperators = path === 'commission-operators' || path.startsWith('commission-operators/');
  if (shouldSanitizeOperators && upstream.ok && upstreamContentType?.includes('application/json')) {
    const data = await upstream.json();
    const sanitized = Array.isArray(data)
      ? data.map((row) => sanitizeOperator(row))
      : sanitizeOperator(data);
    return Response.json(sanitized, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

async function proxyCommissionApi(request: Request, context: CommissionProxyContext) {
  const { path = [] } = await context.params;
  const pathText = path.join('/');

  const adminOnly = isAdminOnlyRequest(pathText, request);
  const denied = await authorizeProxyRequest(pathText, request, adminOnly);
  if (denied) return denied;

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

  init.body = await prepareRequestBody(pathText, request, adminOnly);

  const upstream = await fetch(targetUrl, init);
  return sanitizeResponse(pathText, request, upstream);
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
