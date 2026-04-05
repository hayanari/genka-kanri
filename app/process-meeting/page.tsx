import type { Metadata } from "next";
import AuthGuard from "@/components/AuthGuard";
import ProcessMeetingBoard from "@/components/ProcessMeetingBoard";

export const metadata: Metadata = {
  title: "工程会議ボード | 原価管理",
  description: "工事案件の予定・実施工程（10日区切り）",
};

export default function ProcessMeetingPage() {
  return (
    <AuthGuard>
      <ProcessMeetingBoard />
    </AuthGuard>
  );
}
