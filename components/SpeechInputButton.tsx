"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  onResult: (text: string) => void;
  disabled?: boolean;
};

type Recog = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: {
    resultIndex: number;
    results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
  }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

function errorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return [
        "Chromeにマイクがブロックされています。",
        "",
        "① アドレスバー左の鍵（またはサイト設定）をクリック",
        "②「マイク」を「許可」にする",
        "③ ページを再読み込みして、もう一度🎤を押す",
        "",
        "※ HTTPS（本番）または localhost でのみ使えます",
      ].join("\n");
    case "no-speech":
      return "音声が聞き取れませんでした。もう一度お試しください。";
    case "audio-capture":
      return "マイクが見つかりません。端末のマイク接続を確認してください。";
    case "network":
      return "音声認識サーバーに接続できませんでした。通信環境を確認してください。";
    case "aborted":
      return "";
    default:
      return `音声入力エラー（${code}）。Chromeの最新版でお試しください。`;
  }
}

/** Web Speech API による音声入力（Chrome推奨） */
export default function SpeechInputButton({ onResult, disabled }: Props) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const recRef = useRef<Recog | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => Recog;
      webkitSpeechRecognition?: new () => Recog;
    };
    setSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => {
      try {
        recRef.current?.abort?.();
      } catch {
        /* ignore */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stopMic = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const toggle = useCallback(async () => {
    if (disabled) return;
    setHint(null);

    if (!window.isSecureContext) {
      alert("音声入力は HTTPS または localhost でのみ使えます。");
      return;
    }

    const w = window as unknown as {
      SpeechRecognition?: new () => Recog;
      webkitSpeechRecognition?: new () => Recog;
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      alert("このブラウザは音声入力に対応していません。Google Chrome をご利用ください。");
      return;
    }

    if (listening && recRef.current) {
      try {
        recRef.current.stop();
      } catch {
        /* ignore */
      }
      stopMic();
      setListening(false);
      return;
    }

    // 先にマイク許可を取り、Chromeのブロックを明示的に回避
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
      }
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        alert(errorMessage("not-allowed"));
      } else if (name === "NotFoundError") {
        alert(errorMessage("audio-capture"));
      } else {
        alert("マイクを開始できませんでした。サイトのマイク許可を確認してください。");
      }
      return;
    }

    const rec = new SR();
    rec.lang = "ja-JP";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (ev) => {
      let finalText = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r?.isFinal) finalText += r[0]?.transcript ?? "";
      }
      if (finalText.trim()) onResult(finalText.trim());
    };
    rec.onerror = (ev) => {
      const code = ev.error || "unknown";
      const msg = errorMessage(code);
      if (msg) {
        setHint(msg.split("\n")[0] ?? msg);
        if (code === "not-allowed" || code === "service-not-allowed") alert(msg);
      }
      stopMic();
      setListening(false);
    };
    rec.onend = () => {
      stopMic();
      setListening(false);
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
      setHint("聞き取り中…話してください");
    } catch {
      stopMic();
      setListening(false);
      alert("音声認識を開始できませんでした。少し待ってから再度お試しください。");
    }
  }, [disabled, listening, onResult]);

  if (!supported) {
    return (
      <span style={{ fontSize: 11, color: "#94a3b8" }} title="Chrome推奨">
        音声非対応
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={disabled}
        title="音声入力（マイク許可が必要）"
        style={{
          border: "1px solid #cbd5e1",
          borderRadius: 8,
          padding: "6px 10px",
          fontSize: 12,
          cursor: disabled ? "not-allowed" : "pointer",
          background: listening ? "#fee2e2" : "#fff",
          color: listening ? "#b91c1c" : "#334155",
        }}
      >
        {listening ? "⏹ 停止" : "🎤 音声"}
      </button>
      {hint && (
        <span style={{ fontSize: 10, color: listening ? "#b91c1c" : "#64748b", maxWidth: 220 }}>
          {hint}
        </span>
      )}
    </span>
  );
}
