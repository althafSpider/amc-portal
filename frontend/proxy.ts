import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function proxy(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  })

  if (!token) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Protect all app routes except:
    // - /api/*              (backend handles its own auth via JWT guard)
    // - /login              (sign-in page)
    // - /sw.js              (push notification service worker — must be fetchable
    //                        by the browser outside the session)
    // - static assets       (notification icons, fonts, images)
    // - /_next/*            (Next.js internals)
    // - favicon.ico         (browser icon)
    '/((?!api|login|sw\\.js|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?|css)$|_next/static|_next/image|favicon\\.ico).*)',
  ],
}
