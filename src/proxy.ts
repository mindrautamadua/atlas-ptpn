import { NextResponse, type NextRequest } from 'next/server'
import { verifyToken, SESSION_COOKIE } from '@/lib/session-edge'

const PUBLIC = ['/login']

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p + '/'))

  const session = await verifyToken(req.cookies.get(SESSION_COOKIE)?.value)

  // Unauthenticated → bounce to /login (preserve intended destination).
  if (!session && !isPublic) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }
  // Already signed in → keep away from /login.
  if (session && pathname === '/login') {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  // Run on everything except Next internals and static assets. The trailing
  // extension group keeps metadata icons (/icon.svg, /apple-icon.png), the PWA
  // PNGs, and /offline.html public — otherwise auth would 307 them to /login
  // and the browser/SW would receive HTML instead of the asset.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|assets/|manifest.webmanifest|sw.js|.*\\.(?:svg|png|ico|jpg|jpeg|gif|webp|woff2?|ttf|html)$).*)',
  ],
}
