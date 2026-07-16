"use client";

import Link from "next/link";
import { useState } from "react";
import { T } from "@/lib/constants";
import { normalizeCompanyCode } from "@/lib/tenant";

export default function RegisterPage() {
  const [companyCode, setCompanyCode] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    border: `1px solid ${T.bd}`,
    borderRadius: 8,
    fontFamily: "inherit",
    fontSize: 14,
    boxSizing: "border-box",
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!agreed) {
      setError("個人情報の取扱い・免責事項に同意してください");
      return;
    }
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const res = await fetch("/api/company-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyCode: normalizeCompanyCode(companyCode),
          companyName,
          ownerName,
          address,
          phone,
          contactEmail,
          agreed: true,
          website: honeypot,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "送信に失敗しました");
        return;
      }
      setMessage(
        `承認依頼を受け付けました。審査結果は ${contactEmail} に連絡します。` +
          (data.confirmMailOk
            ? `\n受付確認メールを ${contactEmail} へ送信しました。`
            : `\n※受付確認メールの送信に失敗しました（申込自体は保存済み）。`) +
          (data.ownerMailOk
            ? `\nシステムオーナーへも通知しました。`
            : `\n※オーナー通知メールの送信に失敗しました。`) +
          (data.mailError ? `\n詳細: ${data.mailError}` : "")
      );
      setCompanyCode("");
      setCompanyName("");
      setOwnerName("");
      setAddress("");
      setPhone("");
      setContactEmail("");
      setAgreed(false);
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: T.bg,
        display: "flex",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 640, background: T.s, border: `1px solid ${T.bd}`, borderRadius: 14, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10 }}>
          <h1 style={{ margin: 0, color: T.tx, fontSize: 22 }}>企業登録申込</h1>
          <Link href="/login" style={{ color: T.ac, textDecoration: "none", fontSize: 13 }}>
            ログインへ戻る
          </Link>
        </div>
        <p style={{ marginTop: 0, color: T.ts, fontSize: 13, lineHeight: 1.6 }}>
          必要事項を入力して承認依頼を送信してください。承認後に会社オーナー（ログインID: admin）が自動作成されます。
        </p>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          <label>
            <div style={{ fontSize: 12, color: T.ts, marginBottom: 4 }}>希望する企業ID（半角英数字）</div>
            <input
              required
              value={companyCode}
              onChange={(e) => setCompanyCode(normalizeCompanyCode(e.target.value))}
              placeholder="例: abc-kensetsu"
              style={inputStyle}
            />
          </label>
          <label>
            <div style={{ fontSize: 12, color: T.ts, marginBottom: 4 }}>企業名</div>
            <input required value={companyName} onChange={(e) => setCompanyName(e.target.value)} style={inputStyle} />
          </label>
          <label>
            <div style={{ fontSize: 12, color: T.ts, marginBottom: 4 }}>会社オーナー氏名</div>
            <input required value={ownerName} onChange={(e) => setOwnerName(e.target.value)} style={inputStyle} />
          </label>
          <label>
            <div style={{ fontSize: 12, color: T.ts, marginBottom: 4 }}>住所</div>
            <input required value={address} onChange={(e) => setAddress(e.target.value)} style={inputStyle} />
          </label>
          <label>
            <div style={{ fontSize: 12, color: T.ts, marginBottom: 4 }}>電話番号</div>
            <input required value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
          </label>
          <label>
            <div style={{ fontSize: 12, color: T.ts, marginBottom: 4 }}>承認結果の受信用メールアドレス</div>
            <input
              required
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              style={inputStyle}
            />
          </label>

          {/* ボット対策（画面非表示） */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}>
            <label>
              ウェブサイト
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </label>
          </div>

          <div
            style={{
              padding: 12,
              borderRadius: 8,
              border: `1px solid ${T.bd}`,
              background: T.bg,
              fontSize: 12,
              color: T.ts,
              lineHeight: 1.65,
            }}
          >
            <div style={{ fontWeight: 700, color: T.tx, marginBottom: 6 }}>個人情報の取扱い・免責事項</div>
            <ul style={{ margin: "0 0 10px", paddingLeft: 18 }}>
              <li>ご入力いただいた氏名・住所・電話番号・メールアドレス等の個人情報は、企業登録の審査・連絡・アカウント発行の目的でのみ利用します。</li>
              <li>法令に基づく場合を除き、同意なく第三者へ提供しません。</li>
              <li>本システムおよび通信・保管環境について、情報漏洩・不正アクセス・データ消失等のリスクを完全に排除することは保証できません。</li>
              <li>申込者は上記を理解したうえで、自己の責任において本サービスを申し込み・利用するものとします。</li>
            </ul>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer", color: T.tx }}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                required
                style={{ marginTop: 3 }}
              />
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                上記の個人情報の取扱いおよび免責事項に同意します（必須）
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={saving || !agreed}
            style={{
              padding: "11px 12px",
              borderRadius: 8,
              border: "none",
              fontFamily: "inherit",
              fontWeight: 700,
              color: "#fff",
              background: saving || !agreed ? "#94a3b8" : T.ac,
              cursor: saving || !agreed ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "送信中..." : "承認依頼を送信"}
          </button>
        </form>
        {error && <div style={{ marginTop: 10, fontSize: 13, color: "#b91c1c" }}>{error}</div>}
        {message && <div style={{ marginTop: 10, fontSize: 13, color: "#166534", whiteSpace: "pre-line" }}>{message}</div>}
      </div>
    </div>
  );
}
