// ================================================================
// app/schedule/page.tsx
// スケジュール管理ページ
// ================================================================
import type { Metadata } from 'next'
import AuthGuard from '@/components/AuthGuard'
import ScheduleBoard from '@/components/ScheduleBoard'

export const metadata: Metadata = {
  title: '工事スケジュール管理 | 原価管理',
  description: '工事スケジュール・作業員配置管理ボード',
}

export default function SchedulePage() {
  return (
    <AuthGuard>
      <ScheduleBoard />
    </AuthGuard>
  )
}
