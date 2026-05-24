import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const supabaseUrl = 'https://stwhpggfudlcoubgaqeg.supabase.co'
const supabaseAnonKey = 'sb_publishable_coPQeXtYXY6Wb9PH6IIySw_FC2dP64n'

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const cookieStore = cookies()

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch (err) {
            console.error('Cookie set error in route handler:', err)
          }
        },
      },
    })

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }

    console.error('exchangeCodeForSession error:', error)
    return NextResponse.redirect(
      `${origin}/login?error=auth_callback_error&error_description=${encodeURIComponent(error.message)}`
    )
  }

  return NextResponse.redirect(
    `${origin}/login?error=auth_callback_error&error_description=Missing+code+parameter`
  )
}
