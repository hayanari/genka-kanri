"use client";

import { COST_CATEGORIES, STATUS_MAP, Icons } from "@/lib/constants";
import { projStats } from "@/lib/utils";
import type { Project, Cost, Quantity } from "@/lib/utils";
import { Metric, Card, Bar, Btn } from "./ui/primitives";
import { T } from "@/lib/constants";
import { fmt } from "@/lib/constants";

export default function Dashboard({
  projects,
  costs,
  quantities,
  onNav,
}: {
  projects: Project[];
  costs: Cost[];
  quantities: Quantity[];
  onNav: (v: string, pid?: string) => void;
}) {
  const allStats = projects.map((p) => projStats(p, costs, quantities));
  const totalContract = allStats.reduce((s, st) => s + st.effectiveContract, 0);
  const totalCost = allStats.reduce((s, st) => s + st.totalCost, 0);
  const totalLabor = allStats.reduce((s, st) => s + st.laborDays, 0);
  const totalVehicle = allStats.reduce((s, st) => s + st.vehicleDays, 0);
  const totalPaid = projects.reduce((s, p) => s + p.paidAmount, 0);
  const totalBilled = projects.reduce((s, p) => s + p.billedAmount, 0);
  const grossProfit = totalContract - totalCost;
  const profitRate =
    totalContract > 0 ? Math.round((grossProfit / totalContract) * 100) : 0;
  const normalProjects = projects.filter((p) => p.mode !== "subcontract");
  const subProjects = projects.filter((p) => p.mode === "subcontract");
  const projectIds = new Set(projects.map((p) => p.id));

  const costByCat: Record<string, number> = {};
  costs
    .filter((c) => projectIds.has(c.projectId))
    .forEach((c) => {
      costByCat[c.category] = (costByCat[c.category] || 0) + c.amount;
    });
  const maxCat = Math.max(...Object.values(costByCat), 1);

  const div = (a: number, b: number) => (b ? Math.round(a / b) : 0);

  return (
    <div>
      <div style={{ marginBottom: "28px" }}>
        <h2
          style={{
            margin: 0,
            fontSize: "22px",
            color: T.tx,
            fontWeight: 700,
          }}
        >
          ダッシュボード
        </h2>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: "13px",
            color: T.ts,
          }}
        >
          全案件概要 — 自社施工 {normalProjects.length}件 ／ 一括外注{" "}
          {subProjects.length}件
        </p>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "14px",
        }}
      >
        <Metric big label="総受注額（増減後）" value={`¥${fmt(totalContract)}`} />
        <Metric big label="総原価" value={`¥${fmt(totalCost)}`} color={T.wn} />
        <Metric
          big
          label="粗利"
          value={`¥${fmt(grossProfit)}`}
          sub={`利益率 ${profitRate}%`}
          color={profitRate >= 20 ? T.ok : T.dg}
        />
        <Metric
          big
          label="入金済"
          value={`¥${fmt(totalPaid)}`}
          sub={`未入金 ¥${fmt(totalBilled - totalPaid)}`}
          color={T.ok}
        />
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "24px",
        }}
      >
        <Card
          style={{
            flex: 1,
            minWidth: "280px",
            background: "#1a2744",
            borderColor: "#253a5e",
          }}
        >
          <div
            style={{
              fontSize: "11px",
              color: T.ts,
              marginBottom: "10px",
            }}
          >
            👷 生産性指標（自社施工案件）
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "16px 24px",
            }}
          >
            <div style={{ minWidth: "140px" }}>
              <div style={{ fontSize: "10px", color: "#6b9fff" }}>総人工</div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: T.tx }}>
                {fmt(totalLabor)}
                <span style={{ fontSize: "11px", color: T.ts }}> 人日</span>
              </div>
            </div>
            <div style={{ minWidth: "160px" }}>
              <div style={{ fontSize: "10px", color: "#6b9fff" }}>売上/人工</div>
              <div
                style={{
                  fontSize: "20px",
                  fontWeight: 700,
                  color: "#60a5fa",
                }}
              >
                ¥{fmt(div(totalContract, totalLabor))}
              </div>
            </div>
            <div style={{ minWidth: "160px" }}>
              <div style={{ fontSize: "10px", color: "#6b9fff" }}>
                粗利/人工
              </div>
              <div
                style={{
                  fontSize: "20px",
                  fontWeight: 700,
                  color:
                    grossProfit / (totalLabor || 1) >= 30000 ? T.ok : T.wn,
                }}
              >
                ¥{fmt(div(grossProfit, totalLabor))}
              </div>
            </div>
          </div>
        </Card>
        <Card
          style={{
            flex: "1 1 140px",
            minWidth: "140px",
            background: "#1f1a3d",
            borderColor: "#33285e",
          }}
        >
          <div
            style={{
              fontSize: "11px",
              color: T.ts,
              marginBottom: "10px",
            }}
          >
            🚛 車両稼働
          </div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: T.tx }}>
            {fmt(totalVehicle)}
            <span style={{ fontSize: "12px", color: T.ts }}> 台日</span>
          </div>
        </Card>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "14px",
          marginBottom: "24px",
        }}
      >
        <Card>
          <h4
            style={{
              margin: "0 0 16px",
              fontSize: "14px",
              color: T.tx,
            }}
          >
            原価内訳（自社施工分）
          </h4>
          {Object.entries(COST_CATEGORIES).map(([k, cat]) => {
            const v = costByCat[k] || 0;
            return (
              <div key={k} style={{ marginBottom: "12px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "4px",
                  }}
                >
                  <span style={{ fontSize: "12px", color: T.ts }}>
                    {cat.icon} {cat.label}
                  </span>
                  <span
                    style={{ fontSize: "12px", fontWeight: 600, color: T.tx }}
                  >
                    ¥{fmt(v)}
                  </span>
                </div>
                <Bar
                  value={maxCat ? Math.round((v / maxCat) * 100) : 0}
                  color={cat.color}
                  h={5}
                />
              </div>
            );
          })}
        </Card>
        <Card>
          <h4
            style={{
              margin: "0 0 16px",
              fontSize: "14px",
              color: T.tx,
            }}
          >
            案件別 生産性ランキング
          </h4>
          <div
            style={{
              fontSize: "10px",
              color: T.ts,
              display: "grid",
              gridTemplateColumns: "1fr 55px 75px 75px",
              gap: "4px",
              padding: "0 0 8px",
              borderBottom: `1px solid ${T.bd}`,
            }}
          >
            <span>案件名</span>
            <span style={{ textAlign: "right" }}>人工</span>
            <span style={{ textAlign: "right" }}>売上/人工</span>
            <span style={{ textAlign: "right" }}>粗利/人工</span>
          </div>
          {projects.map((p) => {
            const st = projStats(p, costs, quantities);
            if (p.mode === "subcontract") {
              return (
                <div
                  key={p.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 55px 75px 75px",
                    gap: "4px",
                    padding: "10px 0",
                    borderBottom: `1px solid ${T.bd}22`,
                    cursor: "pointer",
                  }}
                  onClick={() => onNav("detail", p.id)}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      color: T.tx,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.name}
                  </span>
                  <span
                    style={{
                      fontSize: st.laborDays ? "12px" : "11px",
                      color: st.laborDays ? T.ts : T.wn,
                      textAlign: "right",
                    }}
                  >
                    {st.laborDays ? `${st.laborDays}人日` : "外注"}
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      color: T.ts,
                      textAlign: "right",
                    }}
                  >
                    {st.laborDays ? `¥${fmt(st.revenuePerLabor)}` : "—"}
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: T.ok,
                      textAlign: "right",
                    }}
                  >
                    ¥{fmt(st.profit)}
                  </span>
                </div>
              );
            }
            if (st.laborDays === 0) return null;
            return (
              <div
                key={p.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 55px 75px 75px",
                  gap: "4px",
                  padding: "10px 0",
                  borderBottom: `1px solid ${T.bd}22`,
                  cursor: "pointer",
                }}
                onClick={() => onNav("detail", p.id)}
              >
                <span
                  style={{
                    fontSize: "12px",
                    color: T.tx,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {p.name}
                </span>
                <span
                  style={{
                    fontSize: "12px",
                    color: T.ts,
                    textAlign: "right",
                  }}
                >
                  {st.laborDays}人日
                </span>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#60a5fa",
                    textAlign: "right",
                  }}
                >
                  ¥{fmt(st.revenuePerLabor)}
                </span>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color:
                      st.profitPerLabor >= 30000 ? T.ok : T.wn,
                    textAlign: "right",
                  }}
                >
                  ¥{fmt(st.profitPerLabor)}
                </span>
              </div>
            );
          })}
        </Card>
      </div>

      <Card>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "12px",
          }}
        >
          <h4 style={{ margin: 0, fontSize: "14px", color: T.tx }}>
            案件ステータス
          </h4>
          <Btn sm v="ghost" onClick={() => onNav("list")}>
            全案件を見る →
          </Btn>
        </div>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          {Object.entries(STATUS_MAP).map(([k, s]) => {
            const c = projects.filter((p) => p.status === k).length;
            return (
              <div
                key={k}
                style={{
                  padding: "10px 16px",
                  background: T.s2,
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: s.color,
                  }}
                />
                <span style={{ fontSize: "12px", color: T.ts }}>{s.label}</span>
                <span style={{ fontSize: "16px", fontWeight: 700, color: T.tx }}>
                  {c}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
