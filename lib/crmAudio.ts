"use client";

// ================================================================
// lib/crmAudio.ts
// 会議の録音（Plaud 等）を Supabase Storage: crm-audio に保存する
// ※ AI 文字起こし・要約は未導入。書き起こしテキストは手で貼り付ける運用
// ================================================================
import { createClient } from "@/lib/supabase/client";
import { requireCompanyId } from "@/lib/tenant";

const BUCKET = "crm-audio";
export const AUDIO_MAX_BYTES = 50 * 1024 * 1024;
export const AUDIO_ACCEPT = ".m4a,.mp3,.wav,.webm,.ogg,.mp4,.mpeg,.mpga,audio/*";

export type CrmAudioAttachment = { path: string; name: string };

function canAccessPath(companyId: string, path: string): boolean {
  return path.startsWith(`${companyId}/`);
}

export async function uploadCrmAudio(file: File): Promise<CrmAudioAttachment> {
  if (file.size > AUDIO_MAX_BYTES) {
    throw new Error("音声ファイルは 50MB までです。Plaud 側で分割するか、書き起こしテキストを貼り付けてください。");
  }
  const companyId = await requireCompanyId();
  const supabase = createClient();
  const ext = (file.name.split(".").pop() || "m4a").toLowerCase();
  const path = `${companyId}/contact_logs/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) {
    if (/bucket|not found/i.test(error.message)) {
      throw new Error("音声保存先が未設定です。Supabase で supabase/crm_meetings.sql を実行してください。");
    }
    throw error;
  }
  return { path, name: file.name };
}

export async function getCrmAudioUrl(path: string): Promise<string | null> {
  try {
    const companyId = await requireCompanyId();
    if (!canAccessPath(companyId, path)) return null;
    const supabase = createClient();
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

export async function deleteCrmAudio(path: string): Promise<void> {
  try {
    const companyId = await requireCompanyId();
    if (!canAccessPath(companyId, path)) return;
    const supabase = createClient();
    await supabase.storage.from(BUCKET).remove([path]);
  } catch (e) {
    console.error("[deleteCrmAudio]", e);
  }
}