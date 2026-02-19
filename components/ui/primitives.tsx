"use client";

import React from "react";
import { T, STATUS_MAP } from "@/lib/constants";

const statusMap = STATUS_MAP as Record<
  string,
  { label: string; color: string; bg?: string }
>;

export const Badge = ({
  status,
  map = statusMap,
}: {
  status: string;
  map?: Record<string, { label: string; color: string; bg?: string }>;
}) => {
  const s = map[status];
  if (!s) return null;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: "6px",
        fontSize: "11px",
        fontWeight: 600,
        color: s.color,
        background: s.bg || s.color + "18",
      }}
    >
      {s.label}
    </span>
  );
};

export const ModeBadge = ({ mode }: { mode: string }) =>
  mode === "subcontract" ? (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: "6px",
        fontSize: "11px",
        fontWeight: 600,
        color: "#f59e0b",
        background: "#f59e0b18",
      }}
    >
      📋 一括外注
    </span>
  ) : (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: "6px",
        fontSize: "11px",
        fontWeight: 600,
        color: "#4f8cff",
        background: "#4f8cff18",
      }}
    >
      🔧 自社施工
    </span>
  );

export const Bar = ({
  value,
  h = 6,
  color = T.ac,
}: {
  value: number;
  h?: number;
  color?: string;
}) => (
  <div
    style={{
      width: "100%",
      height: h,
      background: T.s2,
      borderRadius: h,
    }}
  >
    <div
      style={{
        width: `${Math.min(100, value)}%`,
        height: "100%",
        borderRadius: h,
        background: value > 100 ? T.dg : color,
        transition: "width 0.4s",
      }}
    />
  </div>
);

export const Btn = ({
  children,
  onClick,
  v = "default",
  sm,
  style: sx,
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  v?: "default" | "primary" | "danger" | "ghost" | "success" | "warning";
  sm?: boolean;
}) => {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: 600,
    fontFamily: "inherit",
    transition: "all .15s",
    whiteSpace: "nowrap" as const,
    padding: sm ? "6px 12px" : "9px 18px",
    fontSize: sm ? "12px" : "13px",
  };
  const vs: Record<string, React.CSSProperties> = {
    default: { background: T.s2, color: T.tx, border: `1px solid ${T.bd}` },
    primary: { background: T.ac, color: "#fff" },
    danger: { background: T.dg + "18", color: T.dg },
    ghost: { background: "transparent", color: T.ts },
    success: { background: T.ok, color: "#fff" },
    warning: { background: T.wn + "18", color: T.wn, border: `1px solid ${T.wn}33` },
  };
  return (
    <button
      onClick={onClick}
      style={{ ...base, ...vs[v], ...(sx as React.CSSProperties) }}
      {...p}
    >
      {children}
    </button>
  );
};

export const Inp = ({
  label,
  style,
  ...p
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
    {label && (
      <label
        style={{ fontSize: "12px", color: T.ts, fontWeight: 500 }}
      >
        {label}
      </label>
    )}
    <input
      {...p}
      style={{
        padding: "9px 12px",
        background: T.s,
        border: `1px solid ${T.bd}`,
        borderRadius: "8px",
        color: T.tx,
        fontSize: "13px",
        fontFamily: "inherit",
        outline: "none",
        width: "100%",
        boxSizing: "border-box",
        ...style,
      }}
    />
  </div>
);

export const Sel = ({
  label,
  children,
  style,
  ...p
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
    {label && (
      <label style={{ fontSize: "12px", color: T.ts, fontWeight: 500 }}>
        {label}
      </label>
    )}
    <select
      {...p}
      style={{
        padding: "9px 12px",
        background: T.s,
        border: `1px solid ${T.bd}`,
        borderRadius: "8px",
        color: T.tx,
        fontSize: "13px",
        fontFamily: "inherit",
        outline: "none",
        width: "100%",
        boxSizing: "border-box",
        ...style,
      }}
    >
      {children}
    </select>
  </div>
);

export const Txt = ({
  label,
  style,
  ...p
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
    {label && (
      <label style={{ fontSize: "12px", color: T.ts, fontWeight: 500 }}>
        {label}
      </label>
    )}
    <textarea
      {...p}
      style={{
        padding: "9px 12px",
        background: T.s,
        border: `1px solid ${T.bd}`,
        borderRadius: "8px",
        color: T.tx,
        fontSize: "13px",
        fontFamily: "inherit",
        outline: "none",
        width: "100%",
        boxSizing: "border-box",
        resize: "vertical",
        minHeight: "56px",
        ...style,
      }}
    />
  </div>
);

export const Card = ({
  children,
  style: sx,
  onClick,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: () => void;
}) => (
  <div
    onClick={onClick}
    style={{
      background: T.s,
      border: `1px solid ${T.bd}`,
      borderRadius: "12px",
      padding: "20px",
      cursor: onClick ? "pointer" : "default",
      transition: "all .15s",
      ...sx,
    }}
  >
    {children}
  </div>
);

export const Modal = ({
  open,
  onClose,
  title,
  children,
  w = 560,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  w?: number;
}) => {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,.7)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.s,
          border: `1px solid ${T.bd}`,
          borderRadius: "16px",
          width: `min(${w}px, 92vw)`,
          maxHeight: "85vh",
          overflow: "auto",
          padding: "28px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
          }}
        >
          <h3 style={{ margin: 0, fontSize: "17px", color: T.tx }}>{title}</h3>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: T.ts,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export const Metric = ({
  label,
  value,
  sub,
  color = T.ac,
  big,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  big?: boolean;
}) => (
  <div
    style={{
      padding: big ? "18px" : "14px",
      background: T.s2,
      borderRadius: "10px",
      flex: 1,
      minWidth: big ? "200px" : "140px",
    }}
  >
    <div
      style={{
        fontSize: "11px",
        color: T.ts,
        marginBottom: "4px",
        letterSpacing: ".03em",
      }}
    >
      {label}
    </div>
    <div style={{ fontSize: big ? "22px" : "17px", fontWeight: 700, color }}>
      {value}
    </div>
    {sub && (
      <div style={{ fontSize: "11px", color: T.ts, marginTop: "3px" }}>
        {sub}
      </div>
    )}
  </div>
);
