/**
 * 自分の権限コンテキスト
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveCallerFromToken } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    const caller = await resolveCallerFromToken(token);
    if (!caller) {
      return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
    }
    return NextResponse.json({
      email: caller.email,
      isPlatformOwner: caller.isPlatformOwner,
      canAccessAdmin: caller.canAccessAdmin,
      companyId: caller.companyId,
      companyCode: caller.companyCode,
      companyName: caller.companyName,
      companyRole: caller.companyRole,
    });
  } catch (e) {
    console.error("[admin/me]", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}
