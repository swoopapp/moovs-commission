import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/admin') && !req.auth?.user) {
    const signInUrl = new URL('/auth/sign-in', req.nextUrl.origin);
    signInUrl.searchParams.set('callbackUrl', `${pathname}${req.nextUrl.search}` || '/admin');
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/admin/:path*'],
};
