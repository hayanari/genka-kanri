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
  onresult: ((ev: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

/** Web Speech API による音声入力（Chrome / 対応 Safari） */
export default function SpeechInputButton({ onResult, disabled }: Props) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recRef = useRef<Recog | null>(null);

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => Recog;
      webkitSpeechRecognition?: new () => Recog;
    };
    setSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  const toggle = useCallback(() => {
    if (disabled) return;
    const w = window as unknown as {
      SpeechRecognition?: new () => Recog;
      webkitSpeechRecognition?: new () => Recog;
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      alert("このブラウザは音声入力に対応していません（Chrome推奨）");
      return;
    }
    if (listening && recRef.current) {
      recRef.current.stop();
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.lang = "ja-JP";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (ev) => {
      const text = ev.results[0]?.[0]?.transcript ?? "";
      if (text) onResult(text);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }, [disabled, listening, onResult, recRef]);

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      title="音声入力"
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
  );
}
