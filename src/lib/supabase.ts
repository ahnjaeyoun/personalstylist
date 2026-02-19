import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string) ||
  'https://aluhrdrlkbtibcmblscw.supabase.co'

const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ||
  'sb_publishable_7RP_KGKUGAW6RZni-1g1tA_x7Bta6kg'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
