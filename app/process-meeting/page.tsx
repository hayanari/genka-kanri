import type { Metadata } from "next";
import AuthGuard from "@/components/AuthGuard";
import ProcessMeetingTabs from "@/components/ProcessMeetingTabs";

export const metadata: Metadata = {
  title: "工程会議ボード | 原価管理",
  description: "工事案件の予定・実施工程（10日区切り）と横断工程表（日別）",
};

export default function ProcessMeetingPage() {
  return (
    <AuthGuard>
      <ProcessMeetingTabs />
    </AuthGuard>
  );
}
