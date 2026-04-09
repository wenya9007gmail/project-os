/**
 * 临时模块声明：@supabase/supabase-js
 *
 * 仅在本机运行 `pnpm install` 前用于通过 TypeScript 类型检查。
 * 安装完 @supabase/supabase-js 后，此文件的声明会被正式类型覆盖。
 */
declare module '@supabase/supabase-js' {
  export interface PostgrestResponse<T> {
    data: T | null
    error: { message: string } | null
  }
  export interface PostgrestSingleResponse<T> extends PostgrestResponse<T> {}

  export interface SupabaseClient {
    from: (table: string) => any   // eslint-disable-line @typescript-eslint/no-explicit-any
    rpc:  (fn: string, params?: Record<string, unknown>) => Promise<PostgrestResponse<unknown>>
  }

  export function createClient(url: string, key: string): SupabaseClient
}
