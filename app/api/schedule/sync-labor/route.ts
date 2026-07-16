import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { syncScheduleLaborForCompany } from "@/lib/scheduleLaborServer"

export const dynamic = "force-dynamic"

/** ログイン中ユーザーの会社について、スケジュール→人工・車両を即時同期 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization")
    const token = authHeader?.replace(/^Bearer\s+/i, "")
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !anon || !service) {
      return NextResponse.json({ error: "server misconfigured" }, { status: 500 })
    }

    const userSb = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const {
      data: { user },
      error: authError,
    } = await userSb.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 })
    }

    const { data: cu } = await userSb
      .from("company_users")
      .select("company_id")
      .eq("user_id", user.id)
      .maybeSingle()

    const companyId = cu?.company_id as string | undefined
    if (!companyId) {
      return NextResponse.json({ error: "会社が紐づいていません" }, { status: 400 })
    }

    const admin = createClient(url, service, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const result = await syncScheduleLaborForCompany(admin, companyId)
    return NextResponse.json({ ok: !result.error, ...result })
  } catch (e) {
    console.error("[sync-labor]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
