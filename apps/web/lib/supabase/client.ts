'use client'
import { createClient } from '@supabase/supabase-js'

let _client: ReturnType<typeof createClient> | null = null

// Browser-side client (使用 anon key)
export function getSupabaseClient() {
  if (_client) return _client
  _client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  return _client
}
