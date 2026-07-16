/**
 * バックアップ復元（破壊ガードを一時解除する RPC 経由）
 * 復元前スナップショットは DB 関数側で作成
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveCallerFromToken } from "@/lib/permissions";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { countGenkaPayload } from "@/lib/dataProtection";

export const dynamic = "force-dynamic";

function bearer(req: NextRequest): string | null {
  const h = req.headers.get("Authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7);
}

export async function POST(request: NextRequest) {
  try {
    if (!isServiceRoleConfigured()) {
      return NextResponse.json({ error: "サーバー設定が不足しています" }, { status: 503 });
    }

    const token = bearer(request);
    if (!token) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const caller = await resolveCallerFromToken(token);
    if (!caller?.companyId) {
      return NextResponse.json({ error: "会社に所属していません" }, { status: 403 });
    }
    if (caller.companyRole === "viewer" && !caller.isPlatformOwner) {
      return NextResponse.json({ error: "閲覧専用のため復元できません" }, { status: 403 });
    }

    const body = await request.json();
    const backupId = String(body.backupId ?? "");
    const inlineData = body.data;

    const admin = createAdminClient();
    let payload: unknown = null;
    let sourceLabel = "inline";

    if (backupId) {
      const { data: row, error } = await admin
        .from("genka_kanri_backups")
        .select("id, company_id, data")
        .eq("id", backupId)
        .maybeSingle();
      if (error || !row) {
        return NextResponse.json({ error: "バックアップが見つかりません" }, { status: 404 });
      }
      if (String(row.company_id) !== String(caller.companyId) && !caller.isPlatformOwner) {
        return NextResponse.json({ error: "他社のバックアップは復元できません" }, { status: 403 });
      }
      payload = row.data;
      sourceLabel = backupId;
    } else if (inlineData && typeof inlineData === "object") {
      payload = inlineData;
    } else {
      return NextResponse.json({ error: "backupId または data が必要です" }, { status: 400 });
    }

    const counts = countGenkaPayload(
      payload as { projects?: unknown[]; costs?: unknown[]; quantities?: unknown[] }
    );
    if (counts.projects === 0 && counts.costs === 0 && counts.quantities === 0) {
      return NextResponse.json(
        { error: "空のバックアップは復元できません" },
        { status: 400 }
      );
    }

    const actor = caller.email || caller.userId;
    const { error: rpcErr } = await admin.rpc("apply_genka_data_restore", {
      p_company_id: caller.companyId,
      p_data: payload,
      p_actor: actor,
    });

    if (rpcErr) {
      console.error("[api/data/restore]", rpcErr);
      // 関数未作成時のフォールバック（SQL未実行環境）
      if (/function|does not exist|schema cache/i.test(rpcErr.message)) {
        const { error: upErr } = await admin.from("genka_kanri_data").upsert(
          {
            id: caller.companyId,
            data: payload,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );
        if (upErr) {
          return NextResponse.json({ error: upErr.message }, { status: 500 });
        }
      } else {
        return NextResponse.json({ error: rpcErr.message }, { status: 500 });
      }
    }

    // スケジュールもバックアップにあれば復元
    const schedule = (payload as { schedule?: unknown })?.schedule;
    if (schedule && typeof schedule === "object") {
      // クライアント側 restoreRemoteBackup と同様に、ここでは案件JSONのみ。
      // スケジュール復元は既存の client helper に任せるため、レスポンスで返す
    }

    return NextResponse.json({
      ok: true,
      companyId: caller.companyId,
      source: sourceLabel,
      counts,
      hasSchedule: Boolean(schedule),
    });
  } catch (e) {
    console.error("[api/data/restore]", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}
