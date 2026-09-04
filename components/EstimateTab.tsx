"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { createClient } from "@/lib/supabase/client";
import { genId } from "@/lib/constants";
import { useUserRole } from "@/lib/roles";
import type { Project } from "@/lib/utils";
import type { Estimate, EstimateEvent, EstimateItem, EstimateStatus } from "@/types/estimate";
import {
  ESTIMATE_EVENT_LABEL,
  ESTIMATE_STATUS_COLOR,
  ESTIMATE_STATUS_LABEL,
  calcEstimateTotals,
  calcItemAmount,
  formatYen,
} from "@/types/estimate";
import {
  buildNewEstimateDraft,
  deleteEstimate,
  ESTIMATE_VIEWER_FORBIDDEN_MSG,
  loadAllEstimates,
  loadEstimateEvents,
  loadEstimatesForProject,
  logEstimateExport,
  resolveEstimateActor,
  saveEstimate,
  setEstimateStatus,
} from "@/lib/estimateStorage";
import EstimateDocument from "@/components/EstimateDocument";
import { Btn, Card, Inp, Modal } from "@/components/ui/primitives";
import { T } from "@/lib/constants";

type Filter = "all" | EstimateStatus;

type Props = {
  /** 指定時はその案件に紐づく見積のみ（参照用） */
  project?: Project;
  /** 案件化コールバック（standalone 用） */
  onConvertToProject?: (estimate: Estimate) => void | Promise<void>;
};

export default function EstimateTab({ project, onConvertToProject }: Props) {
  const standalone = !project;
  const { role } = useUserRole();
  const readOnly = role === "viewer";

  const [list, setList] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Estimate | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [events, setEvents] = useState<EstimateEvent[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [lostModal, setLostModal] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [converting, setConverting] = useState(false);

  const pdfRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = project
        ? await loadEstimatesForProject(project.id)
        : await loadAllEstimates();
      setList(rows);
    } catch (e) {
      console.error("[EstimateTab]", e);
      setLoadError(
        "見積の読み込みに失敗しました。Supabase で supabase/estimates.sql を実行してください。"
      );
    } finally {
      setLoading(false);
    }
  }, [project]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filtered = useMemo(() => {
    if (filter === "all") return list;
    return list.filter((e) => e.status === filter);
  }, [list, filter]);

  const counts = useMemo(() => {
    const c = { all: list.length, draft: 0, confirmed: 0, lost: 0 };
    for (const e of list) c[e.status] += 1;
    return c;
  }, [list]);

  const showNotice = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 2500);
  };

  const openNew = async () => {
    if (readOnly) return;
    const actor = await resolveEstimateActor();
    const draft = buildNewEstimateDraft({
      projectId: project?.id ?? "",
      clientName: project?.client ? `${project.client}` : "",
      workName: project?.name ?? "",
      actor,
    });
    setIsNew(true);
    setEditing(draft);
    setEvents([]);
  };

  const openEdit = async (est: Estimate) => {
    setIsNew(false);
    setEditing({ ...est, items: est.items.map((i) => ({ ...i })) });
    try {
      setEvents(await loadEstimateEvents(est.id));
    } catch {
      setEvents([]);
    }
  };

  const updateDraft = (patch: Partial<Estimate>) => {
    setEditing((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const updateItem = (id: string, patch: Partial<EstimateItem>) => {
    setEditing((prev) => {
      if (!prev) return prev;
      const items = prev.items.map((it) => {
        if (it.id !== id) return it;
        const next = { ...it, ...patch };
        if ("quantity" in patch || "unitPrice" in patch) {
          next.amount = calcItemAmount(next.quantity, next.unitPrice);
        }
        return next;
      });
      const totals = calcEstimateTotals(items, prev.taxRate);
      return { ...prev, items, ...totals };
    });
  };

  const addItem = () => {
    setEditing((prev) => {
      if (!prev) return prev;
      const items = [
        ...prev.items,
        {
          id: genId(),
          section: "",
          kind: "",
          category: "",
          spec: "",
          quantity: 0,
          unit: "",
          unitPrice: 0,
          amount: 0,
          note: "",
          sortOrder: prev.items.length,
        },
      ];
      return { ...prev, items, ...calcEstimateTotals(items, prev.taxRate) };
    });
  };

  const removeItem = (id: string) => {
    setEditing((prev) => {
      if (!prev) return prev;
      const items = prev.items.filter((i) => i.id !== id);
      return { ...prev, items, ...calcEstimateTotals(items, prev.taxRate) };
    });
  };

  const handleSave = async () => {
    if (!editing || readOnly) return;
    setSaving(true);
    try {
      const saved = await saveEstimate(editing, { isNew });
      setIsNew(false);
      setEditing(saved);
      setEvents(await loadEstimateEvents(saved.id));
      await reload();
      showNotice("保存しました");
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (status: EstimateStatus, reason?: string) => {
    if (!editing || readOnly) return;
    // 未保存の新規は先に保存
    setSaving(true);
    try {
      let id = editing.id;
      if (isNew || !list.some((x) => x.id === editing.id)) {
        const saved = await saveEstimate({ ...editing, status: "draft" }, { isNew: true });
        id = saved.id;
        setIsNew(false);
        setEditing(saved);
      }
      await setEstimateStatus(id, status, { lostReason: reason });
      await reload();
      const rows = project
        ? await loadEstimatesForProject(project.id)
        : await loadAllEstimates();
      setList(rows);
      const updated = rows.find((r) => r.id === id) ?? null;
      if (updated) setEditing(updated);
      setEvents(await loadEstimateEvents(id));
      setLostModal(false);
      setLostReason("");
      showNotice(
        status === "confirmed" ? "確定しました" : status === "lost" ? "失注にしました" : "下書きに戻しました"
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editing || readOnly || isNew) return;
    if (!window.confirm("この見積書を削除しますか？履歴も消えます。")) return;
    try {
      await deleteEstimate(editing.id);
      setEditing(null);
      await reload();
      showNotice("削除しました");
    } catch (e) {
      alert(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  const buildPdfBlob = async (): Promise<{ blob: Blob; dataUrl: string; filename: string }> => {
    const root = pdfRef.current;
    if (!root || !editing) throw new Error("PDF用ドキュメントがありません");

    // 画面外でも正しく描画できるよう一時的に可視化領域へ置く
    const host = root.parentElement;
    const prevHost = host
      ? {
          position: host.style.position,
          left: host.style.left,
          top: host.style.top,
          opacity: host.style.opacity,
          zIndex: host.style.zIndex,
          pointerEvents: host.style.pointerEvents,
        }
      : null;
    if (host) {
      host.style.position = "fixed";
      host.style.left = "0";
      host.style.top = "0";
      host.style.opacity = "1";
      host.style.zIndex = "-1";
      host.style.pointerEvents = "none";
    }

    try {
      const pageEls = Array.from(
        root.querySelectorAll<HTMLElement>("[data-estimate-page]")
      );
      if (pageEls.length === 0) throw new Error("PDFページがありません");

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 6;
      const usableW = pageW - margin * 2;
      const usableH = pageH - margin * 2;
      let isFirstPdfPage = true;

      const addCanvasPages = (canvas: HTMLCanvasElement) => {
        const imgW = usableW;
        const pxPerMm = canvas.width / imgW;
        const pageHeightPx = Math.max(1, Math.floor(usableH * pxPerMm));
        let srcY = 0;
        while (srcY < canvas.height) {
          const sliceH = Math.min(pageHeightPx, canvas.height - srcY);
          if (sliceH <= 0) break;
          const sliceCanvas = document.createElement("canvas");
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = sliceH;
          const ctx = sliceCanvas.getContext("2d");
          if (!ctx) throw new Error("Canvas を作成できません");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
          ctx.drawImage(
            canvas,
            0,
            srcY,
            canvas.width,
            sliceH,
            0,
            0,
            canvas.width,
            sliceH
          );
          const sliceHmm = sliceH / pxPerMm;
          if (!isFirstPdfPage) pdf.addPage();
          isFirstPdfPage = false;
          pdf.addImage(
            sliceCanvas.toDataURL("image/png", 1.0),
            "PNG",
            margin,
            margin,
            imgW,
            Math.min(sliceHmm, usableH)
          );
          srcY += sliceH;
        }
      };

      for (const pageEl of pageEls) {
        const canvas = await html2canvas(pageEl, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff",
          // 画面外クリップを避ける
          scrollX: 0,
          scrollY: 0,
          windowWidth: pageEl.scrollWidth,
          windowHeight: pageEl.scrollHeight,
        });
        addCanvasPages(canvas);
      }

      const filename = `見積_${editing.workName || project?.name || "estimate"}_${
        editing.issueDate || "draft"
      }.pdf`.replace(/[\\/:*?"<>|]/g, "_");
      const dataUrl = pdf.output("datauristring");
      const blob = pdf.output("blob");
      return { blob, dataUrl, filename };
    } finally {
      if (host && prevHost) {
        host.style.position = prevHost.position;
        host.style.left = prevHost.left;
        host.style.top = prevHost.top;
        host.style.opacity = prevHost.opacity;
        host.style.zIndex = prevHost.zIndex;
        host.style.pointerEvents = prevHost.pointerEvents;
      }
    }
  };

  const handlePdf = async () => {
    if (!editing) return;
    setPdfBusy(true);
    try {
      if (isNew) {
        const saved = await saveEstimate(editing, { isNew: true });
        setIsNew(false);
        setEditing(saved);
        await reload();
        // 次の tick で DOM 更新を待つ
        await new Promise((r) => setTimeout(r, 50));
      }
      const { blob, filename } = await buildPdfBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      if (editing.id) await logEstimateExport(editing.id, "pdf", { filename });
      setEvents(await loadEstimateEvents(editing.id));
      showNotice("PDFを出力しました");
    } catch (e) {
      alert(e instanceof Error ? e.message : "PDF出力に失敗しました");
    } finally {
      setPdfBusy(false);
    }
  };

  const openEmail = () => {
    if (!editing) return;
    setEmailTo("");
    setEmailSubject(`【御見積書】${editing.workName || project?.name || "工事"}`);
    setEmailMessage(
      `${editing.clientName ? editing.clientName + " 様" : "ご担当者様"}\n\n「${
        editing.workName || project?.name || "工事"
      }」の御見積書を送付いたします。\n添付のPDFをご確認ください。\n\nよろしくお願いいたします。`
    );
    setEmailOpen(true);
  };

  const handleEmail = async () => {
    if (!editing || readOnly) return;
    setEmailSending(true);
    try {
      let est = editing;
      if (isNew) {
        est = await saveEstimate(editing, { isNew: true });
        setIsNew(false);
        setEditing(est);
        await reload();
        await new Promise((r) => setTimeout(r, 50));
      }
      const { dataUrl, filename } = await buildPdfBlob();
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("ログインが必要です");

      const res = await fetch("/api/estimates/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          estimateId: est.id,
          to: emailTo.trim(),
          subject: emailSubject,
          message: emailMessage,
          pdfBase64: dataUrl,
          filename,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "送信に失敗しました");
      setEmailOpen(false);
      setEvents(await loadEstimateEvents(est.id));
      showNotice("メールを送信しました");
    } catch (e) {
      alert(e instanceof Error ? e.message : "送信に失敗しました");
    } finally {
      setEmailSending(false);
    }
  };

  const handleConvert = async () => {
    if (!editing || !onConvertToProject || readOnly) return;
    if (editing.status !== "confirmed") {
      alert("案件化できるのは「確定」した見積だけです。先に確定してください。");
      return;
    }
    if (editing.projectId) {
      alert("すでに案件に紐づいています。");
      return;
    }
    if (!window.confirm("この見積から案件を作成し、紐づけますか？")) return;
    setConverting(true);
    try {
      let est = editing;
      if (isNew) {
        est = await saveEstimate(editing, { isNew: true });
        setIsNew(false);
        setEditing(est);
      }
      await onConvertToProject(est);
      await reload();
      const rows = await loadAllEstimates();
      const updated = rows.find((r) => r.id === est.id);
      if (updated) setEditing(updated);
      setEvents(await loadEstimateEvents(est.id));
      showNotice("案件を作成し、見積を紐づけました");
    } catch (e) {
      alert(e instanceof Error ? e.message : "案件化に失敗しました");
    } finally {
      setConverting(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 24, color: T.ts }}>見積書を読み込み中…</div>;
  }
  if (loadError) {
    return (
      <Card>
        <div style={{ color: "#b91c1c", lineHeight: 1.6 }}>{loadError}</div>
      </Card>
    );
  }

  // 編集画面
  if (editing) {
    const totals = calcEstimateTotals(editing.items, editing.taxRate);
    return (
      <div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <Btn v="ghost" sm onClick={() => setEditing(null)}>
            ← 一覧へ
          </Btn>
          <StatusBadge status={editing.status} />
          <span style={{ fontSize: 12, color: T.ts }}>
            作成: {editing.createdByName || "—"}
            {editing.createdAt
              ? `（${new Date(editing.createdAt).toLocaleString("ja-JP")}）`
              : isNew
                ? "（未保存）"
                : ""}
          </span>
          <span style={{ flex: 1 }} />
          {notice && <span style={{ fontSize: 12, color: "#16a34a" }}>{notice}</span>}
          {!readOnly && (
            <>
              <Btn sm onClick={() => void handleSave()} disabled={saving}>
                {saving ? "保存中…" : "保存"}
              </Btn>
              {editing.status !== "confirmed" && (
                <Btn
                  sm
                  onClick={() => void handleStatus("confirmed")}
                  disabled={saving}
                  style={{ background: "#16a34a", borderColor: "#16a34a" }}
                >
                  確定
                </Btn>
              )}
              {editing.status !== "lost" && (
                <Btn sm v="ghost" onClick={() => setLostModal(true)} disabled={saving}>
                  失注
                </Btn>
              )}
              {editing.status !== "draft" && (
                <Btn sm v="ghost" onClick={() => void handleStatus("draft")} disabled={saving}>
                  下書きに戻す
                </Btn>
              )}
            </>
          )}
          <Btn sm v="ghost" onClick={() => void handlePdf()} disabled={pdfBusy}>
            {pdfBusy ? "PDF…" : "PDF出力"}
          </Btn>
          {!readOnly && (
            <Btn sm v="ghost" onClick={openEmail}>
              メール送信
            </Btn>
          )}
          {standalone &&
            onConvertToProject &&
            !readOnly &&
            editing.status === "confirmed" &&
            !editing.projectId && (
              <Btn
                sm
                v="primary"
                onClick={() => void handleConvert()}
                disabled={converting || saving}
              >
                {converting ? "案件化中…" : "案件にする"}
              </Btn>
            )}
          {!readOnly && !isNew && (
            <Btn sm v="ghost" onClick={() => void handleDelete()} style={{ color: "#b91c1c" }}>
              削除
            </Btn>
          )}
        </div>

        {editing.projectId ? (
          <p style={{ fontSize: 12, color: T.ts, marginTop: 0 }}>
            案件に紐づき済み（案件ID: {editing.projectId}）
          </p>
        ) : standalone ? (
          <p style={{ fontSize: 12, color: T.ts, marginTop: 0 }}>
            案件化前の見積です。確定後に「案件にする」で案件一覧へ送れます。
          </p>
        ) : null}

        <Card style={{ marginBottom: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 10,
            }}
          >
            <Field label="お客様名">
              <Inp
                value={editing.clientName}
                disabled={readOnly}
                onChange={(e) => updateDraft({ clientName: e.target.value })}
              />
            </Field>
            <Field label="工事名称">
              <Inp
                value={editing.workName}
                disabled={readOnly}
                onChange={(e) => updateDraft({ workName: e.target.value })}
              />
            </Field>
            <Field label="工事場所">
              <Inp
                value={editing.siteLocation}
                disabled={readOnly}
                onChange={(e) => updateDraft({ siteLocation: e.target.value })}
              />
            </Field>
            <Field label="見積日">
              <Inp
                type="date"
                value={editing.issueDate}
                disabled={readOnly}
                onChange={(e) => updateDraft({ issueDate: e.target.value })}
              />
            </Field>
            <Field label="有効期間">
              <Inp
                value={editing.validPeriod}
                disabled={readOnly}
                onChange={(e) => updateDraft({ validPeriod: e.target.value })}
              />
            </Field>
            <Field label="見積番号（任意）">
              <Inp
                value={editing.estimateNo}
                disabled={readOnly}
                onChange={(e) => updateDraft({ estimateNo: e.target.value })}
              />
            </Field>
            <Field label="消費税率 (%)">
              <Inp
                type="number"
                value={String(editing.taxRate)}
                disabled={readOnly}
                onChange={(e) => {
                  const taxRate = Number(e.target.value) || 0;
                  const t = calcEstimateTotals(editing.items, taxRate);
                  updateDraft({ taxRate, ...t });
                }}
              />
            </Field>
          </div>

          <div style={{ marginTop: 12, fontSize: 12, fontWeight: 600, color: T.ts }}>
            発行元（印鑑は後日設定）
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 10,
              marginTop: 6,
            }}
          >
            {(
              [
                ["postalCode", "郵便番号"],
                ["address", "住所"],
                ["companyName", "会社名"],
                ["representative", "代表者"],
                ["tel", "TEL"],
                ["fax", "FAX"],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={label}>
                <Inp
                  value={editing.issuer[key]}
                  disabled={readOnly}
                  onChange={(e) =>
                    updateDraft({ issuer: { ...editing.issuer, [key]: e.target.value } })
                  }
                />
              </Field>
            ))}
          </div>

          <Field label="備考・条件" style={{ marginTop: 12 }}>
            <textarea
              value={editing.notes}
              disabled={readOnly}
              rows={3}
              onChange={(e) => updateDraft({ notes: e.target.value })}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                fontSize: 14,
                fontFamily: "inherit",
                resize: "vertical",
                minHeight: 80,
              }}
            />
          </Field>
        </Card>

        <Card style={{ marginBottom: 12 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <strong>内訳明細</strong>
            {!readOnly && (
              <Btn sm onClick={addItem}>
                ＋ 行追加
              </Btn>
            )}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                  {[
                    "区分",
                    "種別",
                    "形状・寸法",
                    "数量",
                    "単位",
                    "単価",
                    "金額",
                    "備考",
                    "",
                  ].map((h) => (
                    <th key={h} style={{ padding: "6px 4px", borderBottom: "1px solid #e2e8f0" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {editing.items.map((it) => (
                  <tr key={it.id}>
                    <td style={cell}>
                      <input
                        value={it.section}
                        disabled={readOnly}
                        placeholder="材料費など"
                        onChange={(e) => updateItem(it.id, { section: e.target.value })}
                        style={cellInp}
                      />
                    </td>
                    <td style={cell}>
                      <input
                        value={it.category}
                        disabled={readOnly}
                        onChange={(e) => updateItem(it.id, { category: e.target.value })}
                        style={cellInp}
                      />
                    </td>
                    <td style={cell}>
                      <input
                        value={it.spec}
                        disabled={readOnly}
                        onChange={(e) => updateItem(it.id, { spec: e.target.value })}
                        style={cellInp}
                      />
                    </td>
                    <td style={cell}>
                      <input
                        type="number"
                        value={it.quantity || ""}
                        disabled={readOnly}
                        onChange={(e) =>
                          updateItem(it.id, { quantity: Number(e.target.value) || 0 })
                        }
                        style={{ ...cellInp, width: 72 }}
                      />
                    </td>
                    <td style={cell}>
                      <input
                        value={it.unit}
                        disabled={readOnly}
                        onChange={(e) => updateItem(it.id, { unit: e.target.value })}
                        style={{ ...cellInp, width: 56 }}
                      />
                    </td>
                    <td style={cell}>
                      <input
                        type="number"
                        value={it.unitPrice || ""}
                        disabled={readOnly}
                        onChange={(e) =>
                          updateItem(it.id, { unitPrice: Number(e.target.value) || 0 })
                        }
                        style={{ ...cellInp, width: 90 }}
                      />
                    </td>
                    <td style={{ ...cell, textAlign: "right", whiteSpace: "nowrap" }}>
                      {formatYen(it.amount)}
                    </td>
                    <td style={cell}>
                      <input
                        value={it.note}
                        disabled={readOnly}
                        onChange={(e) => updateItem(it.id, { note: e.target.value })}
                        style={cellInp}
                      />
                    </td>
                    <td style={cell}>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => removeItem(it.id)}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "#94a3b8",
                            cursor: "pointer",
                          }}
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div
            style={{
              marginTop: 12,
              display: "flex",
              justifyContent: "flex-end",
              gap: 24,
              fontSize: 13,
            }}
          >
            <span>小計 {formatYen(totals.subtotal)}</span>
            <span>
              税（{editing.taxRate}%） {formatYen(totals.taxAmount)}
            </span>
            <strong style={{ fontSize: 16 }}>合計 {formatYen(totals.totalAmount)}</strong>
          </div>
        </Card>

        <Card>
          <strong style={{ display: "block", marginBottom: 8 }}>履歴</strong>
          {events.length === 0 ? (
            <div style={{ fontSize: 12, color: T.ts }}>まだ履歴はありません</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.8 }}>
              {events.map((ev) => (
                <li key={ev.id}>
                  <strong>{ESTIMATE_EVENT_LABEL[ev.action] ?? ev.action}</strong>
                  {" — "}
                  {ev.actorName || ev.actorEmail || "—"}
                  {" / "}
                  {ev.createdAt ? new Date(ev.createdAt).toLocaleString("ja-JP") : ""}
                  {ev.action === "emailed" && ev.detail?.to
                    ? ` → ${String(ev.detail.to)}`
                    : ""}
                  {ev.action === "lost" && ev.detail?.lostReason
                    ? `（${String(ev.detail.lostReason)}）`
                    : ""}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* PDF用（出力時に一時的に可視化領域へ移動してキャプチャ） */}
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: "-12000px",
            top: 0,
            pointerEvents: "none",
            opacity: 1,
            width: 794,
          }}
        >
          <EstimateDocument
            ref={pdfRef}
            estimate={{ ...editing, ...totals }}
          />
        </div>

        {lostModal && (
          <Modal title="失注にする" onClose={() => setLostModal(false)}>
            <p style={{ fontSize: 13, color: T.ts, marginTop: 0 }}>
              失注理由（任意）を残して確定してください。
            </p>
            <textarea
              value={lostReason}
              rows={3}
              onChange={(e) => setLostReason(e.target.value)}
              placeholder="例: 他社受注 / 予算都合"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                fontSize: 14,
                fontFamily: "inherit",
                resize: "vertical",
                minHeight: 80,
              }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <Btn v="ghost" sm onClick={() => setLostModal(false)}>
                キャンセル
              </Btn>
              <Btn sm onClick={() => void handleStatus("lost", lostReason)} disabled={saving}>
                失注にする
              </Btn>
            </div>
          </Modal>
        )}

        {emailOpen && (
          <Modal title="見積書をメール送信" onClose={() => setEmailOpen(false)}>
            <Field label="宛先">
              <Inp
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="client@example.com"
              />
            </Field>
            <Field label="件名" style={{ marginTop: 8 }}>
              <Inp value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
            </Field>
            <Field label="本文" style={{ marginTop: 8 }}>
              <textarea
                value={emailMessage}
                rows={6}
                onChange={(e) => setEmailMessage(e.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  fontSize: 14,
                  fontFamily: "inherit",
                  resize: "vertical",
                  minHeight: 120,
                }}
              />
            </Field>
            <p style={{ fontSize: 11, color: T.ts }}>PDFを自動添付します（印鑑は未設定）。</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn v="ghost" sm onClick={() => setEmailOpen(false)}>
                キャンセル
              </Btn>
              <Btn sm onClick={() => void handleEmail()} disabled={emailSending || !emailTo.trim()}>
                {emailSending ? "送信中…" : "送信"}
              </Btn>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  // 一覧
  return (
    <div>
      {standalone && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 20, color: T.tx }}>見積書一覧</h2>
          <span style={{ fontSize: 12, color: T.ts }}>
            案件化前の見積を管理します（失注もここに残ります）
          </span>
        </div>
      )}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        {(
          [
            ["all", "すべて"],
            ["draft", "下書き"],
            ["confirmed", "確定"],
            ["lost", "失注"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            style={{
              border: "1px solid #cbd5e1",
              borderRadius: 999,
              padding: "4px 12px",
              fontSize: 12,
              cursor: "pointer",
              background: filter === id ? T.ac : "#fff",
              color: filter === id ? "#fff" : T.tx,
            }}
          >
            {label}（{counts[id]}）
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {notice && <span style={{ fontSize: 12, color: "#16a34a" }}>{notice}</span>}
        {!readOnly && (
          <Btn sm onClick={() => void openNew()}>
            ＋ 見積書を作成
          </Btn>
        )}
      </div>

      {readOnly && (
        <p style={{ fontSize: 12, color: T.ts }}>{ESTIMATE_VIEWER_FORBIDDEN_MSG}</p>
      )}

      {filtered.length === 0 ? (
        <Card>
          <div style={{ color: T.ts, fontSize: 13, padding: 8 }}>
            {standalone
              ? "見積書はまだありません。「＋ 見積書を作成」から案件化前の見積を作れます。"
              : "この案件に紐づく見積はまだありません。左メニュー「見積書」で作成し、案件化してください。"}
          </div>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((est) => (
            <button
              key={est.id}
              type="button"
              onClick={() => void openEdit(est)}
              style={{
                textAlign: "left",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                padding: "12px 14px",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <StatusBadge status={est.status} />
                <strong style={{ fontSize: 14 }}>{est.workName || "(無題)"}</strong>
                <span style={{ marginLeft: "auto", fontWeight: 700 }}>
                  {formatYen(est.totalAmount)}
                </span>
              </div>
              <div style={{ fontSize: 12, color: T.ts, marginTop: 4 }}>
                {est.clientName || "—"}　/　見積日 {est.issueDate || "—"}
                {"　/　"}
                作成 {est.createdByName || est.createdByEmail || "—"}
                {est.createdAt
                  ? `（${new Date(est.createdAt).toLocaleString("ja-JP")}）`
                  : ""}
                {standalone && (
                  <>
                    {"　/　"}
                    {est.projectId ? "案件紐づき済" : "未案件化"}
                  </>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: EstimateStatus }) {
  const c = ESTIMATE_STATUS_COLOR[status];
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
      }}
    >
      {ESTIMATE_STATUS_LABEL[status]}
    </span>
  );
}

function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <label style={{ display: "block", fontSize: 12, ...style }}>
      <span style={{ display: "block", marginBottom: 4, color: T.ts, fontWeight: 600 }}>
        {label}
      </span>
      <div style={{ width: "100%" }}>{children}</div>
    </label>
  );
}

const cell: React.CSSProperties = {
  padding: "4px 2px",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "middle",
};
const cellInp: React.CSSProperties = {
  width: "100%",
  border: "1px solid #e2e8f0",
  borderRadius: 4,
  padding: "4px 6px",
  fontSize: 12,
  boxSizing: "border-box",
};
