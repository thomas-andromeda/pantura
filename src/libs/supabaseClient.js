import { createClient } from '@supabase/supabase-js'

const supabaseUrl = "https://stwhpggfudlcoubgaqeg.supabase.co"
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0d2hwZ2dmdWRsY291YmdhcWVnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjU2MjU0NywiZXhwIjoyMDkyMTM4NTQ3fQ.Jl-u4gpDfZ2y54Upu08k7XZc3KavskFh-rjhyZZ5VCY"

export const supabase = createClient(supabaseUrl, supabaseKey)