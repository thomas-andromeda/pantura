import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://stwhpggfudlcoubgaqeg.supabase.co"
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_coPQeXtYXY6Wb9PH6IIySw_FC2dP64n"

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)

// Ekspor konstanta agar bisa dipakai di middleware & auth callback
export { supabaseUrl, supabaseAnonKey }