"use client";

// ================================================================
// 現場入力（スマホ向け）
// その日の作業実績（工事名・作業員・車両・メモ）を現場から直接
// スケジュール（schedule_entries）に登録するシンプルな画面
// ================================================================
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import { T, genId } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { loadData } from "@/lib/supabase/data";
import { loadScheduleData } from "@/lib/scheduleStorage";
import { canWrite } from "@/lib/roles";
import { logAudit } from "@/lib/auditLog";
import type { Vehicle } from "@/lib/utils";
import type { ScheduleEntry } from "@/types/schedule";

const TODAY = new Date().toISOString().slice(0, 10);

export default function FieldInputPage() {
  const [projectNames, setProjectNames] = useState<string[]>([]);
  const [workerList, setWorkerList] = useState<string[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [dayEntries, setDayEntries] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [date, setDate] = useState(TODAY);
  const [koujimei, setKoujimei] = useState("");
  const [freeKoujimei, setFreeKoujimei] = useState("");
  const [shift, setShift] = useState<"day" | "night">("day");
  const [selWorkers, setSelWorkers] = useState<string[]>([]);
  const [selVehicles, setSelVehicles] = useState<string[]>([]);
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshDayEntries = useCallback(async (d: string) => {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("schedule_entries")
        .select("*")
        .eq("date", d)
        .order("created_at");
      setDayEntries(
        (data ?? []).map((r: { id: string; date: string; koujimei: string; shift: string; workers: string[]; vehicle_ids?: string[]; memo: string }) => ({
          id: r.id,
          date: r.date,
          koujimei: r.koujimei ?? "",
          shift: r.shift as "day" | "night" | "off",
          workers: r.workers ?? [],
          vehicleIds: r.vehicle_ids ?? [],
          memo: r.memo ?? "",
        }))
      );
    } catch {
      setDayEntries([]);
    }
  }, []);

  useEffect(() => {
    Promise.all([loadData(), loadScheduleData()]).then(([d, s]) => {
      if (d) {
        setProjectNames(
          d.projects.filter((p) => !p.archived && !p.deleted).map((p) => p.name)
        );
        setVehicles(d.vehicles ?? []);
      }
      if (s) setWorkerList(s.workers ?? []);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    refreshDayEntries(date);
  }, [date, refreshDayEntries]);

  const toggle = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  const effectiveKoujimei = koujimei === "__free__" ? freeKoujimei.trim() : koujimei;

  const handleSubmit = async () => {
    if (!effectiveKoujimei) {
      alert("工事名を選択（または入力）してください");
      return;
    }
    if (selWorkers.length === 0) {
      alert("作業員を1人以上選択してください");
      return;
    }
    if (!(await canWrite())) {
      alert("閲覧専用の権限のため登録できません。管理者に変更権限を依頼してください。");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("schedule_entries").insert({
        id: genId(),
        date,
        koujimei: effectiveKoujimei,
        shift,
        workers: selWorkers,
        vehicle_ids: selVehicles,
        memo,
      });
      if (error) throw error;
      logAudit(
        "現場入力",
        `${date} ${effectiveKoujimei}（${shift === "day" ? "日勤" : "夜勤"}）作業員: ${selWorkers.join("、")}${memo ? `\nメモ: ${memo}` : ""}`
      );
      setNotice("登録しました ✅");
      setSelWorkers([]);
      setSelVehicles([]);
      setMemo("");
      await refreshDayEntries(date);
      window.setTimeout(() => setNotice(null), 4000);
    } catch (e) {
      console.error("[field]", e);
      alert("登録に失敗しました。電波状況を確認してもう一度お試しください。");
    } finally {
      setSaving(false);
    }
  };

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: "10px 14px",
    borderRadius: 999,
    border: `1.5px solid ${active ? T.ac : T.bd}`,
    background: active ? T.al : T.s,
    color: active ? T.ac : T.tx,
    fontSize: 14,
    fontWeight: active ? 700 : 400,
    cursor: "pointer",
    fontFamily: "inherit",
    minHeight: 44,
  });

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: T.ts,
    margin: "18px 0 8px",
    display: "block",
  };

  return (
    <AuthGuard>
      <div
        style={{
          minHeight: "100vh",
          background: T.bg,
          fontFamily: "'Noto Sans JP', sans-serif",
          padding: "16px 16px calc(32px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <Link href="/" style={{ color: T.ts, textDecoration: "none", fontSize: 14 }}>
              ← 戻る
            </Link>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.tx }}>
              📱 現場入力
            </h1>
          </div>

          {notice && (
            <div
              style={{
                background: "#ecfdf5",
                border: "1px solid #6ee7b7",
                color: "#065f46",
                padding: "12px 16px",
                borderRadius: 10,
                fontSize: 14,
                marginBottom: 14,
                fontWeight: 600,
              }}
            >
              {notice}
            </div>
          )}

          <div
            style={{
              background: T.s,
              border: `1px solid ${T.bd}`,
              borderRadius: 12,
              padding: 18,
            }}
          >
            {loading ? (
              <div style={{ color: T.ts, fontSize: 14 }}>読み込み中...</div>
            ) : (
              <>
                <label style={{ ...labelStyle, marginTop: 0 }}>日付</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "12px",
                    borderRadius: 10,
                    border: `1px solid ${T.bd}`,
                    fontSize: 16,
                    fontFamily: "inherit",
                  }}
                />

                <label style={labelStyle}>工事名</label>
                <select
                  value={koujimei}
                  onChange={(e) => setKoujimei(e.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "12px",
                    borderRadius: 10,
                    border: `1px solid ${T.bd}`,
                    fontSize: 16,
                    fontFamily: "inherit",
                    background: T.s,
                  }}
                >
                  <option value="">選択してください</option>
                  {projectNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                  <option value="__free__">その他（自由入力）</option>
                </select>
                {koujimei === "__free__" && (
                  <input
                    type="text"
                    value={freeKoujimei}
                    onChange={(e) => setFreeKoujimei(e.target.value)}
                    placeholder="工事名を入力"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "12px",
                      borderRadius: 10,
                      border: `1px solid ${T.bd}`,
                      fontSize: 16,
                      fontFamily: "inherit",
                      marginTop: 8,
                    }}
                  />
                )}

                <label style={labelStyle}>勤務</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={() => setShift("day")} style={chipStyle(shift === "day")}>
                    ☀️ 日勤
                  </button>
                  <button type="button" onClick={() => setShift("night")} style={chipStyle(shift === "night")}>
                    🌙 夜勤
                  </button>
                </div>

                <label style={labelStyle}>作業員（タップで選択）</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {workerList.map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setSelWorkers((prev) => toggle(prev, w))}
                      style={chipStyle(selWorkers.includes(w))}
                    >
                      {w}
                    </button>
                  ))}
                  {workerList.length === 0 && (
                    <span style={{ fontSize: 13, color: T.ts }}>
                      作業員マスターが未登録です（スケジュール管理で登録）
                    </span>
                  )}
                </div>

                {vehicles.length > 0 && (
                  <>
                    <label style={labelStyle}>使用車両（タップで選択・任意）</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {vehicles.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setSelVehicles((prev) => toggle(prev, v.id))}
                          style={{ ...chipStyle(selVehicles.includes(v.id)), fontFamily: "monospace" }}
                        >
                          {v.registration}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                <label style={labelStyle}>メモ（任意）</label>
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="作業内容・特記事項など"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "12px",
                    borderRadius: 10,
                    border: `1px solid ${T.bd}`,
                    fontSize: 16,
                    fontFamily: "inherit",
                    minHeight: 80,
                    resize: "vertical",
                  }}
                />

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving}
                  style={{
                    width: "100%",
                    marginTop: 18,
                    padding: "16px",
                    borderRadius: 12,
                    border: "none",
                    background: saving ? T.ts : T.ac,
                    color: "#fff",
                    fontSize: 16,
                    fontWeight: 700,
                    fontFamily: "inherit",
                    cursor: saving ? "wait" : "pointer",
                  }}
                >
                  {saving ? "登録中..." : "この内容で登録する"}
                </button>
              </>
            )}
          </div>

          {dayEntries.length > 0 && (
            <div
              style={{
                background: T.s,
                border: `1px solid ${T.bd}`,
                borderRadius: 12,
                padding: 18,
                marginTop: 16,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: T.tx, marginBottom: 10 }}>
                📋 {date} の登録済み予定（{dayEntries.length}件）
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {dayEntries.map((e) => (
                  <div
                    key={e.id}
                    style={{
                      padding: "10px 12px",
                      background: T.s2,
                      borderRadius: 8,
                      fontSize: 13,
                    }}
                  >
                    <div style={{ fontWeight: 600, color: T.tx }}>
                      {e.shift === "night" ? "🌙" : e.shift === "off" ? "🏖" : "☀️"} {e.koujimei}
                    </div>
                    <div style={{ color: T.ts, marginTop: 2 }}>
                      {e.workers.join("、")}
                      {e.memo ? ` ／ ${e.memo}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
