"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { clearTenantCache, fetchCurrentTenant } from "@/lib/tenant";
import { clearRoleCache } from "@/lib/roles";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [ok, setOk] = useState(false);
  const [message, setMessage] = useState("読み込み中...");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.user) {
          if (!cancelled) {
            setOk(false);
            setLoading(false);
          }
          return;
        }
        const tenant = await fetchCurrentTenant();
        if (!tenant) {
          // 所属なし: セッションを切ってログインへ
          clearTenantCache();
          clearRoleCache();
          await supabase.auth.signOut();
          if (!cancelled) {
            setMessage("会社に所属していないアカウントです。管理者に連絡してください。");
            setOk(false);
            setLoading(false);
          }
          return;
        }
        if (!cancelled) {
          setOk(true);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setOk(false);
          setLoading(false);
        }
      }
    };
    void run();

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        clearTenantCache();
        setOk(false);
      } else {
        void fetchCurrentTenant().then((t) => {
          if (!t) {
            clearTenantCache();
            clearRoleCache();
            void supabase.auth.signOut();
            setOk(false);
          } else {
            setOk(true);
          }
        });
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!ok) {
      router.replace("/login");
    }
  }, [loading, ok, router]);

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0c0e14",
          color: "#7c84a0",
          fontSize: "14px",
        }}
      >
        {message}
      </div>
    );
  }

  if (!ok) {
    return null;
  }

  return <>{children}</>;
}
