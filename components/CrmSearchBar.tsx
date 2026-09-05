"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Project } from "@/lib/utils";
import type { ContactLog, Customer } from "@/types/crm";
import { searchCrm } from "@/lib/crmStorage";
import { VISIBILITY_LABEL } from "@/types/crm";
import { T } from "@/lib/constants";

type Props = {
  projects: Project[];
  onOpenCustomer?: (customerId: string) => void;
  onOpenProject?: (projectId: string) => void;
  onOpenLog?: (log: ContactLog) => void;
};

function highlight(text: string, q: string) {
  if (!q.trim()) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: "#fef08a", padding: 0 }}>{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export default function CrmSearchBar({
  projects,
  onOpenCustomer,
  onOpenProject,
  onOpenLog,
}: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [logs, setLogs] = useState<ContactLog[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setCustomers([]);
        setLogs([]);
        return;
      }
      setLoading(true);
      try {
        const res = await searchCrm(query);
        setCustomers(res.customers);
        setLogs(res.logs);
      } catch (e) {
        console.error("[CrmSearch]", e);
        setCustomers([]);
        setLogs([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(q), 280);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, run]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const projectHits = q.trim()
    ? projects
        .filter((p) => !p.deleted && !p.archived)
        .filter(
          (p) =>
            p.name.includes(q) ||
            p.client.includes(q) ||
            (p.managementNumber ?? "").includes(q)
        )
        .slice(0, 20)
    : [];

  const hasAny = customers.length + logs.length + projectHits.length > 0;

  return (
    <div ref={boxRef} style={{ position: "relative", flex: 1, minWidth: 160, maxWidth: 420 }}>
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="顧客・商談・案件を検索…"
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "8px 12px",
          borderRadius: 8,
          border: `1px solid ${T.bd}`,
          fontSize: 13,
          background: "#fff",
        }}
      />
      {open && q.trim() && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            background: "#fff",
            border: `1px solid ${T.bd}`,
            borderRadius: 10,
            boxShadow: "0 12px 32px rgba(15,23,42,0.15)",
            maxHeight: 420,
            overflow: "auto",
            zIndex: 50,
            padding: 8,
          }}
        >
          {loading && <div style={{ padding: 8, fontSize: 12, color: T.ts }}>検索中…</div>}
          {!loading && !hasAny && (
            <div style={{ padding: 8, fontSize: 12, color: T.ts }}>該当なし</div>
          )}
          {customers.length > 0 && (
            <Section title="顧客">
              {customers.map((c) => (
                <ResultBtn
                  key={c.id}
                  onClick={() => {
                    onOpenCustomer?.(c.id);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  <strong>{highlight(c.name, q)}</strong>
                  <span style={{ color: T.ts, fontSize: 11 }}> {c.contactPerson}</span>
                </ResultBtn>
              ))}
            </Section>
          )}
          {logs.length > 0 && (
            <Section title="商談メモ">
              {logs.map((l) => (
                <ResultBtn
                  key={l.id}
                  onClick={() => {
                    onOpenLog?.(l);
                    setOpen(false);
                  }}
                >
                  <div>
                    <strong>{highlight(l.title || "(無題)", q)}</strong>
                    <span style={{ fontSize: 10, marginLeft: 6, color: T.ts }}>
                      {VISIBILITY_LABEL[l.visibility]}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: T.ts }}>
                    {l.customerName} / {highlight(l.body.slice(0, 80), q)}
                  </div>
                </ResultBtn>
              ))}
            </Section>
          )}
          {projectHits.length > 0 && (
            <Section title="案件">
              {projectHits.map((p) => (
                <ResultBtn
                  key={p.id}
                  onClick={() => {
                    onOpenProject?.(p.id);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  <strong>
                    {p.managementNumber ? `${p.managementNumber} ` : ""}
                    {highlight(p.name, q)}
                  </strong>
                  <div style={{ fontSize: 11, color: T.ts }}>{highlight(p.client, q)}</div>
                </ResultBtn>
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.ts, padding: "4px 8px" }}>{title}</div>
      {children}
    </div>
  );
}

function ResultBtn({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        border: "none",
        background: "transparent",
        padding: "8px 10px",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 13,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "#f8fafc";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}
