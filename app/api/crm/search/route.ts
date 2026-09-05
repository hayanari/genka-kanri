/**
 * CRM横断検索 API（ユーザーJWT + anon。service_role禁止）
 * RLSにより見えないメモは返らない
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
    if (!q) return NextResponse.json({ customers: [], logs: [] });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
    }

    const safe = q.replace(/[%_,]/g, " ");
    const pattern = `%${safe}%`;

    const [cRes, pRes, lRes] = await Promise.all([
      supabase
        .from("customers")
        .select("id, name, contact_person, phone, email")
        .or(`name.ilike.${pattern},contact_person.ilike.${pattern},note.ilike.${pattern}`)
        .limit(30),
      supabase
        .from("customer_contacts")
        .select("customer_id, name")
        .or(`name.ilike.${pattern},title.ilike.${pattern}`)
        .limit(30),
      supabase
        .from("contact_logs")
        .select("id, customer_id, title, body, visibility, contact_date, customers(name)")
        .or(`title.ilike.${pattern},body.ilike.${pattern}`)
        .limit(40),
    ]);

    if (cRes.error) {
      return NextResponse.json({ error: cRes.error.message }, { status: 400 });
    }
    if (lRes.error) {
      return NextResponse.json({ error: lRes.error.message }, { status: 400 });
    }

    const byId = new Map((cRes.data ?? []).map((r) => [r.id as string, r]));
    const missingIds = [
      ...new Set((pRes.error ? [] : pRes.data ?? []).map((r) => r.customer_id as string)),
    ].filter((id) => !byId.has(id));
    if (missingIds.length > 0) {
      const extra = await supabase
        .from("customers")
        .select("id, name, contact_person, phone, email")
        .in("id", missingIds);
      for (const r of extra.data ?? []) byId.set(r.id as string, r);
    }

    return NextResponse.json({
      customers: [...byId.values()],
      logs: lRes.data ?? [],
    });
  } catch (e) {
    console.error("[crm/search]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "検索エラー" },
      { status: 500 }
    );
  }
}
