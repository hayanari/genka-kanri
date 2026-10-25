/**
 * API ルート共通のリクエスト補助関数
 */
import { timingSafeEqual } from "crypto";

/** クライアントIP（x-forwarded-for の先頭 → x-real-ip → "unknown"） */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip")?.trim();
  return real || "unknown";
}

/** Authorization ヘッダーから Bearer トークンを取り出す（無ければ null） */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return m ? m[1] : null;
}

/**
 * 定数時間の文字列比較。
 * 長さが異なる場合も同じコストをかけたうえで false を返す。
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // 長さ差でタイミングが漏れないよう、同じ長さ同士で比較してから false
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
