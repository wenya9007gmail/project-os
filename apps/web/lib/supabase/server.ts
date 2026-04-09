import { createClient } from '@supabase/supabase-js'

// Server-side client (使用 service role key，绕过 RLS)
export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key, {
    auth: { persistSession: false },
  })
}

// 便捷函数：在 API Route 中直接用
export const supabase = () => createServerClient()
