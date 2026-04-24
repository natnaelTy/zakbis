import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { createClient } from '@/lib/supabase/server';

/**
 * Middleware to enforce authentication and role‑based access.
 */
export async function middleware(request: NextRequest) {
  // Preserve existing Supabase session handling
  const response = await updateSession(request);

  const { pathname } = request.nextUrl;

  // Public routes that do not require a logged‑in user
  const publicRoutes = ['/', '/auth', '/api/auth', '/register', '/login', '/forgot-password'];
  if (publicRoutes.some((r) => pathname.startsWith(r))) {
    return response;
  }

  // Get authenticated user
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    // Redirect unauthenticated users to login
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  // Fetch profile to obtain role
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = profile?.role;

  // Map route prefixes to allowed roles
  const roleAccess: Record<string, string[]> = {
    '/buy-me': ['TRAVELER', 'RECEIVER'],
    '/triangular': ['SENDER', 'RECEIVER'],
    '/delivery': ['SENDER', 'TRAVELER', 'RECEIVER'],
    '/traveler': ['TRAVELER'],
    '/chat': ['SENDER', 'TRAVELER', 'RECEIVER'],
    '/profile': ['SENDER', 'TRAVELER', 'RECEIVER'],
  };

  for (const [prefix, allowed] of Object.entries(roleAccess)) {
    if (pathname.startsWith(prefix) && (!role || !allowed.includes(role))) {
      // Role not permitted – send back to dashboard
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
