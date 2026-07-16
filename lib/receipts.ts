"use client";

// ================================================================
// lib/receipts.ts
// 領収書・請求書の写真添付（Supabase Storage: receipts バケット）
// ================================================================
import { createClient } from "@/lib/supabase/client";
import { requireCompanyId } from "@/lib/tenant";

const BUCKET = "receipts";

export interface ReceiptAttachment {
  id: string;
  path: string;
  name: string;
}

function canAccessPath(companyId: string, path: string): boolean {
  if (path.startsWith(`${companyId}/`)) return true;
  // 移行前のパス（会社プレフィックスなし）は当面許可
  if (path.startsWith("costs/")) return true;
  return false;
}

/** ファイルをアップロードして添付情報を返す。失敗時は null */
export async function uploadReceipt(
  file: File,
  costId: string
): Promise<ReceiptAttachment | null> {
  try {
    const companyId = await requireCompanyId();
    const supabase = createClient();
    const ext = file.name.split(".").pop() || "jpg";
    const safeName = `${Date.now()}.${ext}`;
    const path = `${companyId}/costs/${costId}/${safeName}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (error) {
      console.error("[uploadReceipt]", error);
      return null;
    }
    return {
      id: Math.random().toString(36).slice(2, 10),
      path,
      name: file.name,
    };
  } catch (e) {
    console.error("[uploadReceipt]", e);
    return null;
  }
}

/** 閲覧用の署名付きURL（1時間有効）。失敗時は null */
export async function getReceiptUrl(path: string): Promise<string | null> {
  try {
    const companyId = await requireCompanyId();
    if (!canAccessPath(companyId, path)) {
      console.warn("[getReceiptUrl] path rejected", path);
      return null;
    }
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

export async function deleteReceipt(path: string): Promise<void> {
  try {
    const companyId = await requireCompanyId();
    if (!canAccessPath(companyId, path)) {
      console.warn("[deleteReceipt] path rejected", path);
      return;
    }
    const supabase = createClient();
    await supabase.storage.from(BUCKET).remove([path]);
  } catch (e) {
    console.error("[deleteReceipt]", e);
  }
}
