"use client";

import { useEffect, useState } from "react";
import type { CompanyMember, ContactVisibility } from "@/types/crm";
import { VISIBILITY_HINT, VISIBILITY_LABEL } from "@/types/crm";
import { loadCompanyMembers } from "@/lib/crmStorage";
import { createClient } from "@/lib/supabase/client";
import { T } from "@/lib/constants";

type Props = {
  visibility: ContactVisibility;
  onVisibilityChange: (v: ContactVisibility) => void;
  /** 公開範囲に加えて閲覧を許可するスタッフ */
  viewerIds: string[];
  onViewerIdsChange: (ids: string[]) => void;
};

/**
 * 公開範囲（全社 / 役員のみ / 自分のみ）＋ 個別スタッフの追加許可
 * 全社公開のときはスタッフ選択を出さない
 */
export default function VisibilityPicker({
  visibility,
  onVisibilityChange,
  viewerIds,
  onViewerIdsChange,
}: Props) {
  const [members, setMembers] = useState<CompanyMember[] | null>(null);
  const [meId, setMeId] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [{ data }, list] = await Promise.all([supabase.auth.getUser(), loadCompanyMembers()]);
      if (cancelled) return;
      setMeId(data.user?.id ?? "");
      setMembers(list);
    })().catch(() => {
      if (!cancelled) setMembers([]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (id: string) => {
    onViewerIdsChange(viewerIds.includes(id) ? viewerIds.filter((v) => v !== id) : [...viewerIds, id]);
  };

  const candidates = (members ?? []).filter((m) => m.userId !== meId);
  // 役員のみ公開なら、役員はすでに見えるので候補から外す
  const shown = visibility === "executive" ? candidates.filter((m) => !m.isExecutive) : candidates;
  const selectedCount = viewerIds.filter((id) => shown.some((m) => m.userId === id)).length;

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: T.ts, marginBottom: 6 }}>公開範囲</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {(["company", "executive", "private"] as ContactVisibility[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onVisibilityChange(v)}
            title={VISIBILITY_HINT[v]}
            style={{
              border: visibility === v ? `2px solid ${T.ac}` : `1px solid ${T.bd}`,
              borderRadius: 999,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              background: visibility === v ? "#eff6ff" : "#fff",
              color: T.tx,
              fontFamily: "inherit",
            }}
          >
            {VISIBILITY_LABEL[v]}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: T.ts, marginTop: 4 }}>{VISIBILITY_HINT[visibility]}</div>

      {visibility !== "company" && (
        <div
          style={{
            marginTop: 8,
            padding: "8px 10px",
            border: `1px dashed ${T.bd}`,
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: T.ts, marginBottom: 6 }}>
            このスタッフにも見せる
            {selectedCount > 0 && (
              <span style={{ marginLeft: 6, color: T.ac }}>{selectedCount}人</span>
            )}
          </div>
          {members === null ? (
            <span style={{ fontSize: 12, color: T.ts }}>読み込み中…</span>
          ) : shown.length === 0 ? (
            <span style={{ fontSize: 12, color: T.ts }}>追加できるスタッフがいません</span>
          ) : (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {shown.map((m) => {
                const on = viewerIds.includes(m.userId);
                return (
                  <button
                    key={m.userId}
                    type="button"
                    onClick={() => toggle(m.userId)}
                    style={{
                      border: on ? `2px solid ${T.ac}` : `1px solid ${T.bd}`,
                      background: on ? "#eff6ff" : "#fff",
                      borderRadius: 999,
                      padding: "4px 10px",
                      fontSize: 12,
                      cursor: "pointer",
                      color: T.tx,
                      fontFamily: "inherit",
                    }}
                  >
                    {on ? "✓ " : ""}
                    {m.name}
                    {m.isExecutive && <span style={{ color: T.ts, marginLeft: 4 }}>役員</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
