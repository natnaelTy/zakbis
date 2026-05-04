import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { createClient } from '@/lib/supabase/server';

/**
 * Proxy to enforce authentication and role-based access.
 */
export async function proxy(request: NextRequest) {
  const response = await updateSession(request);

  const { pathname } = request.nextUrl;

  const publicRoutes = ['/', '/auth', '/api/auth', '/register', '/login', '/forgot-password'];
  if (publicRoutes.some((r) => pathname.startsWith(r))) {
    return response;
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = profile?.role;

  const roleAccess: Record<string, string[]> = {
    '/buy-me': ['SENDER', 'TRAVELER', 'RECEIVER'],
    '/triangular': ['SENDER', 'RECEIVER'],
    '/delivery': ['SENDER', 'TRAVELER', 'RECEIVER'],
    '/traveler': ['TRAVELER'],
    '/chat': ['SENDER', 'TRAVELER', 'RECEIVER'],
    '/profile': ['SENDER', 'TRAVELER', 'RECEIVER'],
  };

  for (const [prefix, allowed] of Object.entries(roleAccess)) {
    if (pathname.startsWith(prefix) && (!role || !allowed.includes(role))) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
