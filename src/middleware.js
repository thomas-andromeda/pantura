import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

const supabaseUrl = 'https://stwhpggfudlcoubgaqeg.supabase.co'
const supabaseAnonKey = 'sb_publishable_coPQeXtYXY6Wb9PH6IIySw_FC2dP64n'

export async function middleware(request) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  // PENTING: Jangan ubah urutan ini.
  // getUser() memvalidasi token dan me-refresh session jika expired.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Halaman publik (tidak perlu login)
  const publicPaths = ['/login', '/register', '/forgot-password']
  const isPublicPath = publicPaths.some(p => pathname.startsWith(p))

  // Auth callback (untuk OAuth redirect)
  const isAuthCallback = pathname.startsWith('/auth/callback')

  // Skip middleware untuk auth callback
  if (isAuthCallback) {
    return supabaseResponse
  }

  // Belum login → redirect ke /login
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Sudah login → redirect dari halaman auth ke dashboard
  if (user && isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

// Matcher: jalankan middleware pada semua route KECUALI static files
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|images|api|assets|iconify-icons).*)',
  ],
}
