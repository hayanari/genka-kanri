"use client";

// 見積書の印刷・PDF用ドキュメント（表紙1ページ + 内訳ページ）
import React, { forwardRef } from "react";
import type { Estimate } from "@/types/estimate";
import { formatWarekiDate, formatYen } from "@/types/estimate";

type Props = {
  estimate: Estimate;
};

function yenPlain(n: number): string {
  return Math.round(n || 0).toLocaleString("ja-JP");
}

/** A4相当（96dpi）: 210mm ≈ 794px, 297mm ≈ 1123px。余白込みでページ内に収める */
const PAGE: React.CSSProperties = {
  width: 794,
  minHeight: 1123,
  boxSizing: "border-box",
  padding: 40,
  background: "#fff",
  color: "#111",
  fontFamily: '"Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif',
  position: "relative",
};

const EstimateDocument = forwardRef<HTMLDivElement, Props>(function EstimateDocument(
  { estimate },
  ref
) {
  const issuer = estimate.issuer;
  const coverKind =
    estimate.items.find((i) => i.kind.trim())?.kind ||
    estimate.items.find((i) => i.section.trim())?.section ||
    "本工事";
  const coverCategory =
    estimate.items
      .map((i) => i.category || i.section)
      .filter(Boolean)
      .slice(0, 1)[0] || "";

  return (
    <div ref={ref} style={{ background: "#fff" }}>
      {/* 表紙（1ページ） */}
      <section data-estimate-page="cover" style={PAGE}>
        <div style={{ textAlign: "right", fontSize: 13, marginBottom: 8 }}>
          {formatWarekiDate(estimate.issueDate)}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginBottom: 24,
            fontSize: 11,
            color: "#64748b",
          }}
        >
          {["承認", "確認", "担当"].map((label) => (
            <div
              key={label}
              style={{
                width: 64,
                height: 72,
                border: "1px solid #94a3b8",
                textAlign: "center",
                paddingTop: 4,
              }}
            >
              {label}
              <div style={{ fontSize: 9, marginTop: 28, color: "#cbd5e1" }}>印</div>
            </div>
          ))}
        </div>

        <h1
          style={{
            textAlign: "center",
            fontSize: 28,
            letterSpacing: "0.4em",
            margin: "16px 0 28px",
            fontWeight: 700,
          }}
        >
          御　見　積　書
        </h1>

        <div style={{ display: "flex", gap: 24, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                borderBottom: "2px solid #111",
                paddingBottom: 6,
                marginBottom: 14,
              }}
            >
              {estimate.clientName || "　　　　　　　　"}　様
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.9 }}>
              <div>工事名称：{estimate.workName || "—"}</div>
              <div>工事場所：{estimate.siteLocation || "—"}</div>
              <div>有効期間：{estimate.validPeriod || "—"}</div>
              <div style={{ marginTop: 10 }}>下記の通り御見積申し上げます。</div>
            </div>
            <div
              style={{
                marginTop: 18,
                fontSize: 26,
                fontWeight: 800,
                letterSpacing: "0.05em",
              }}
            >
              {formatYen(estimate.totalAmount)}
              <span style={{ fontSize: 12, fontWeight: 500, marginLeft: 8, color: "#64748b" }}>
                （税込）
              </span>
            </div>
          </div>
          <div
            style={{
              width: 260,
              fontSize: 12,
              lineHeight: 1.7,
              border: "1px solid #cbd5e1",
              padding: 12,
              background: "#f8fafc",
            }}
          >
            <div>{issuer.postalCode}</div>
            <div>{issuer.address}</div>
            <div style={{ fontWeight: 700, marginTop: 6, fontSize: 14 }}>
              {issuer.companyName}
            </div>
            <div>{issuer.representative}</div>
            <div style={{ marginTop: 6 }}>{issuer.tel}</div>
            <div>{issuer.fax}</div>
            <div
              style={{
                marginTop: 16,
                height: 64,
                border: "1px dashed #cbd5e1",
                color: "#94a3b8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
              }}
            >
              印鑑欄（後日設定）
            </div>
          </div>
        </div>

        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12,
            marginTop: 8,
          }}
        >
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              {["工種", "種別", "単位", "数量", "金額", "摘要"].map((h) => (
                <th
                  key={h}
                  style={{
                    border: "1px solid #94a3b8",
                    padding: "6px 8px",
                    textAlign: "center",
                    fontWeight: 600,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={td}>{coverKind}</td>
              <td style={td}>{coverCategory || "—"}</td>
              <td style={{ ...td, textAlign: "center" }}>式</td>
              <td style={{ ...td, textAlign: "right" }}>1</td>
              <td style={{ ...td, textAlign: "right" }}>{yenPlain(estimate.subtotal)}</td>
              <td style={td}></td>
            </tr>
            <tr>
              <td style={td}>消費税</td>
              <td style={td}></td>
              <td style={{ ...td, textAlign: "center" }}>式</td>
              <td style={{ ...td, textAlign: "right" }}></td>
              <td style={{ ...td, textAlign: "right" }}>{yenPlain(estimate.taxAmount)}</td>
              <td style={td}>{estimate.taxRate}%</td>
            </tr>
            <tr>
              <td style={{ ...td, fontWeight: 700 }}>合計</td>
              <td style={td}></td>
              <td style={td}></td>
              <td style={td}></td>
              <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>
                {yenPlain(estimate.totalAmount)}
              </td>
              <td style={td}>※消費税含む</td>
            </tr>
          </tbody>
        </table>

        {estimate.notes && (
          <div style={{ marginTop: 16, fontSize: 12, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
            {estimate.notes}
          </div>
        )}
      </section>

      {/* 内訳（長い場合はPDF側でページ分割） */}
      <section data-estimate-page="detail" style={{ ...PAGE, marginTop: 0 }}>
        <h2 style={{ fontSize: 16, marginBottom: 12, borderBottom: "2px solid #111", paddingBottom: 6 }}>
          内　訳
        </h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              {[
                "工種・種目",
                "種別",
                "形状・寸法",
                "数量",
                "単位",
                "単価",
                "金額",
                "備考",
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    border: "1px solid #94a3b8",
                    padding: "5px 4px",
                    textAlign: "center",
                    fontWeight: 600,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {estimate.items.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ ...td, textAlign: "center", color: "#94a3b8" }}>
                  明細なし
                </td>
              </tr>
            ) : (
              estimate.items.map((it) => (
                <tr key={it.id}>
                  <td style={td}>{it.section || it.kind}</td>
                  <td style={td}>{it.category}</td>
                  <td style={td}>{it.spec}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    {it.quantity ? Number(it.quantity).toLocaleString("ja-JP") : ""}
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>{it.unit}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    {it.unitPrice ? yenPlain(it.unitPrice) : ""}
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>{yenPlain(it.amount)}</td>
                  <td style={td}>{it.note}</td>
                </tr>
              ))
            )}
            <tr>
              <td colSpan={6} style={{ ...td, textAlign: "right", fontWeight: 700 }}>
                小計
              </td>
              <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>
                {yenPlain(estimate.subtotal)}
              </td>
              <td style={td}></td>
            </tr>
          </tbody>
        </table>
        <div style={{ textAlign: "right", marginTop: 20, fontSize: 12, color: "#475569" }}>
          {issuer.companyName}
        </div>
      </section>
    </div>
  );
});

const td: React.CSSProperties = {
  border: "1px solid #94a3b8",
  padding: "5px 6px",
  verticalAlign: "top",
};

export default EstimateDocument;
