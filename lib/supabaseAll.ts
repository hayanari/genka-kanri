// ================================================================
// lib/supabaseAll.ts
// PostgREST は1リクエストあたり既定で最大 1000 行しか返さない。
// 全件が必要な読み込みは range() でページングして取り切る。
// （クライアント・サーバー両方から使う。'use client' は付けない）
// ================================================================

export const SUPABASE_PAGE_SIZE = 1000

type PageResult<T> = { data: T[] | null; error: { message: string } | null }

/**
 * build(from, to) に .range(from, to) を付けたクエリを返してもらい、
 * 返却行数がページサイズ未満になるまで繰り返して全件を集める。
 * 安定した並び順（ユニーク列を含む order）を build 側で指定すること。
 */
export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize: number = SUPABASE_PAGE_SIZE
): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1)
    if (error) return { data: out, error }
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < pageSize) break
  }
  return { data: out, error: null }
}
