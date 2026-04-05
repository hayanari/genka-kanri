"use client";

import React from "react";
import { T, STATUS_MAP } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Btn
// ---------------------------------------------------------------------------
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** default = 枠付きセカンダリ */
  v?: "primary" | "ghost" | "success" | "warning" | "danger" | "default";
  sm?: boolean;
};

export function Btn({ v, sm, style, children, type = "button", ...rest }: BtnProps) {
  const base: React.CSSProperties = {
    fontFamily: "inherit",
    cursor: "pointer",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: sm ? 12 : 14,
    padding: sm ? "8px 12px" : "10px 18px",
    transition: "all .15s",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  };
  let variant: React.CSSProperties = {};
  if (v === "ghost") {
    variant = {
      background: "transparent",
      color: T.ts,
      border: "none",
    };
  } else if (v === "primary") {
    variant = {
      background: T.ac,
      color: "#fff",
      border: "none",
    };
  } else if (v === "success") {
    variant = {
      background: T.ok,
      color: "#fff",
      border: "none",
    };
  } else if (v === "warning") {
    variant = {
      background: T.wn,
      color: "#fff",
      border: "none",
    };
  } else if (v === "danger") {
    variant = {
      background: T.dg,
      color: "#fff",
      border: "none",
    };
  } else {
    /* default / undefined / "default" */
    variant = {
      background: T.s2,
      color: T.tx,
      border: `1px solid ${T.bd}`,
    };
  }
  return (
    <button type={type} style={{ ...base, ...variant, ...style }} {...rest}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Badge（案件ステータス・入札ステータス等）
// ---------------------------------------------------------------------------
export function Badge({
  status,
  map = STATUS_MAP,
}: {
  status: string;
  map?: Record<string, { label: string; color: string; bg?: string }>;
}) {
  const m = map[status];
  if (!m) {
    return (
      <span style={{ fontSize: 11, color: T.ts, fontWeight: 500 }}>{status}</span>
    );
  }
  return (
    <span
      style={{
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: 4,
        fontWeight: 600,
        color: m.color,
        background: m.bg ?? `${m.color}18`,
      }}
    >
      {m.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ModeBadge（自社施工 / 一括外注）
// ---------------------------------------------------------------------------
export function ModeBadge({ mode }: { mode: "normal" | "subcontract" }) {
  const isSub = mode === "subcontract";
  return (
    <span
      style={{
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: 4,
        fontWeight: 600,
        color: isSub ? T.wn : T.ac,
        background: isSub ? `${T.wn}22` : T.al,
      }}
    >
      {isSub ? "一括外注" : "自社施工"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Metric（数値サマリカード）
// ---------------------------------------------------------------------------
export function Metric({
  label,
  value,
  sub,
  color = T.tx,
  big,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  big?: boolean;
}) {
  return (
    <div
      style={{
        padding: big ? "14px 18px" : "10px 14px",
        borderRadius: 10,
        background: T.s2,
        border: `1px solid ${T.bd}`,
        minWidth: big ? 132 : 108,
        boxSizing: "border-box",
      }}
    >
      <div style={{ fontSize: 11, color: T.ts, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: big ? 18 : 15, fontWeight: 700, color }}>{value}</div>
      {sub ? (
        <div style={{ fontSize: 11, color: T.ts, marginTop: 4 }}>{sub}</div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bar（プログレスバー）
// ---------------------------------------------------------------------------
export function Bar({
  value,
  color = T.ac,
  h = 8,
}: {
  value: number;
  color?: string;
  h?: number;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      style={{
        height: h,
        borderRadius: 4,
        background: T.bd,
        overflow: "hidden",
        width: "100%",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          background: color,
          borderRadius: 4,
          transition: "width .2s ease",
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inp
// ---------------------------------------------------------------------------
type InpProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

export function Inp({ label, style, className, ...rest }: InpProps) {
  const inputStyle: React.CSSProperties = {
    boxSizing: "border-box",
    padding: "10px 12px",
    borderRadius: 8,
    border: `1px solid ${T.bd}`,
    fontSize: 14,
    fontFamily: "inherit",
    background: T.s,
    color: T.tx,
    width: label ? "100%" : undefined,
    ...style,
  };

  const input = <input className={className} style={inputStyle} {...rest} />;

  if (!label) return input;

  return (
    <div>
      <label
        style={{
          fontSize: 12,
          color: T.ts,
          fontWeight: 500,
          marginBottom: 6,
          display: "block",
        }}
      >
        {label}
      </label>
      {input}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sel
// ---------------------------------------------------------------------------
type SelProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
};

export function Sel({ label, style, className, children, ...rest }: SelProps) {
  const selStyle: React.CSSProperties = {
    boxSizing: "border-box",
    padding: "10px 12px",
    borderRadius: 8,
    border: `1px solid ${T.bd}`,
    fontSize: 14,
    fontFamily: "inherit",
    background: T.s,
    color: T.tx,
    width: label ? "100%" : undefined,
    cursor: "pointer",
    ...style,
  };

  const sel = (
    <select className={className} style={selStyle} {...rest}>
      {children}
    </select>
  );

  if (!label) return sel;

  return (
    <div>
      <label
        style={{
          fontSize: 12,
          color: T.ts,
          fontWeight: 500,
          marginBottom: 6,
          display: "block",
        }}
      >
        {label}
      </label>
      {sel}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Txt (textarea)
// ---------------------------------------------------------------------------
type TxtProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
};

export function Txt({ label, style, ...rest }: TxtProps) {
  return (
    <div>
      <label
        style={{
          fontSize: 12,
          color: T.ts,
          fontWeight: 500,
          marginBottom: 6,
          display: "block",
        }}
      >
        {label}
      </label>
      <textarea
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "10px 12px",
          borderRadius: 8,
          border: `1px solid ${T.bd}`,
          fontSize: 14,
          fontFamily: "inherit",
          background: T.s,
          color: T.tx,
          resize: "vertical",
          minHeight: 80,
          ...style,
        }}
        {...rest}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
};

export function Card({ children, style, onClick, className, ...rest }: CardProps) {
  return (
    <div
      className={className}
      onClick={onClick}
      {...rest}
      style={{
        background: T.s,
        border: `1px solid ${T.bd}`,
        borderRadius: 12,
        padding: 20,
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
export function Modal({
  open = true,
  onClose,
  title,
  w = 520,
  children,
}: {
  open?: boolean;
  onClose: () => void;
  title: string;
  w?: number;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          background: T.s,
          borderRadius: 12,
          maxWidth: "95vw",
          width: w,
          maxHeight: "92vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          border: `1px solid ${T.bd}`,
          boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "14px 18px",
            borderBottom: `1px solid ${T.bd}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: T.tx }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            style={{
              background: "none",
              border: "none",
              fontSize: 22,
              lineHeight: 1,
              cursor: "pointer",
              color: T.ts,
              padding: 4,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: 18, overflow: "auto", flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}
