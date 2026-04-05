// ================================================================
// lib/sampleData.ts
// 3月サンプルデータ（2026年3月のみ、テーブル空の初回で使用）
// ================================================================
import type { ScheduleData, ScheduleEntry } from '@/types/schedule'

export const DEFAULT_WORKERS: string[] = [
    '吉村', '河居', '宮前', '渡辺', '光嶋', '山本', '西田', '織田', '清井',
    '大江', '青木', '山田', '北野', '平山', '矢山', '市原', '父', '東', '朝', '土',
    '松井親子', '山城', '関山', '黒田', '和田', '松浦', '藤澤産業',
  ]

export const SAMPLE_DATA: ScheduleData = {
    workers: DEFAULT_WORKERS,
    dayMemos: {
          '2025-03-09': '材料搬入確認要',
          '2025-03-17': '社長立ち合い予定',
    },
    schedules: [
          /* ── 3/9（日） ── */
      { id: 's01', date: '2025-03-09', shift: 'day', koujimei: '10.神明町FFT-SA', workers: ['光嶋','青木','大江','山田'], memo: '' },
      { id: 's02', date: '2025-03-09', shift: 'day', koujimei: '24.神明町更生B', workers: ['河居','渡辺','織田','藤澤産業'], memo: '' },
      { id: 's03', date: '2025-03-09', shift: 'day', koujimei: '大庭寺内面補修', workers: ['宮前','山本'], memo: '' },
      { id: 's04', date: '2025-03-09', shift: 'day', koujimei: '天野山ゴルフ場', workers: ['市原','清井','平山'], memo: '3tJM' },
      { id: 's05', date: '2025-03-09', shift: 'night', koujimei: '空洞調査', workers: ['西田','北野','土'], memo: '夜間' },
      { id: 's06', date: '2025-03-09', shift: 'off', koujimei: '有休', workers: ['吉村','松浦'], memo: '' },
          /* ── 3/10（月） ── */
      { id: 's07', date: '2025-03-10', shift: 'day', koujimei: '大庭寺内面補修', workers: ['山本','宮前','平山'], memo: '' },
      { id: 's08', date: '2025-03-10', shift: 'night', koujimei: '空洞調査', workers: ['西田','北野','土'], memo: '' },
          /* ── 3/11（火） ── */
      { id: 's09', date: '2025-03-11', shift: 'day', koujimei: '29.神明町FFT-SA', workers: ['吉村','光嶋','青木','大江','山田'], memo: '' },
      { id: 's10', date: '2025-03-11', shift: 'day', koujimei: '22北旅籠更生Bナ', workers: ['河居','朝','藤澤産業'], memo: '' },
      { id: 's11', date: '2025-03-11', shift: 'day', koujimei: '福知山クリスタル', workers: ['宮前','渡辺','平山'], memo: '出張' },
      { id: 's12', date: '2025-03-11', shift: 'night', koujimei: '奈良流域目視', workers: ['矢山','山本','西田'], memo: '夜間' },
          /* ── 3/12（水） ── */
      { id: 's13', date: '2025-03-12', shift: 'day', koujimei: '30.神明町FFT-SA', workers: ['吉村','光嶋','青木','大江','山田'], memo: '' },
      { id: 's14', date: '2025-03-12', shift: 'day', koujimei: '23北旅籠更生Bナ', workers: ['河居','織田','藤澤産業'], memo: '' },
      { id: 's15', date: '2025-03-12', shift: 'day', koujimei: '福知山クリスタル', workers: ['宮前','渡辺','平山'], memo: '出張' },
      { id: 's16', date: '2025-03-12', shift: 'night', koujimei: '空洞調査', workers: ['北野','土','東'], memo: '' },
      { id: 's17', date: '2025-03-12', shift: 'off', koujimei: '有休', workers: ['清井'], memo: '' },
          /* ── 3/16（日） ── */
      { id: 's18', date: '2025-03-16', shift: 'day', koujimei: '80.神明町FFT-SA', workers: ['吉村','光嶋','渡辺','青木','平山'], memo: '' },
      { id: 's19', date: '2025-03-16', shift: 'day', koujimei: '北旅籠更生Bナ', workers: ['河居','織田','山田','大江','藤澤産業'], memo: '' },
      { id: 's20', date: '2025-03-16', shift: 'day', koujimei: '原池公園', workers: ['山本','宮前'], memo: 'トイレ' },
      { id: 's21', date: '2025-03-16', shift: 'night', koujimei: '空洞調査', workers: ['西田','北野','土'], memo: '' },
          /* ── 3/17（月） ── */
      { id: 's22', date: '2025-03-17', shift: 'day', koujimei: '80.神明町FFT-SA', workers: ['吉村','光嶋','渡辺','青木','平山'], memo: '' },
      { id: 's23', date: '2025-03-17', shift: 'day', koujimei: '北旅籠更生Bナ', workers: ['河居','織田','山田','大江','藤澤産業'], memo: '' },
      { id: 's24', date: '2025-03-17', shift: 'day', koujimei: '原池公園', workers: ['山本','宮前'], memo: '' },
      { id: 's25', date: '2025-03-17', shift: 'night', koujimei: '奈良流域目視', workers: ['矢山','西田','北野','土'], memo: '夜間' },
          /* ── 3/18（火） ── */
      { id: 's26', date: '2025-03-18', shift: 'day', koujimei: '80.神明町FFT-SA', workers: ['吉村','光嶋','渡辺','青木','平山'], memo: '' },
      { id: 's27', date: '2025-03-18', shift: 'day', koujimei: '北旅籠更生Bナ', workers: ['河居','織田','山田','大江','藤澤産業'], memo: '' },
      { id: 's28', date: '2025-03-18', shift: 'day', koujimei: '大阪狭山市給食センター', workers: ['市原','渡辺','平山'], memo: '' },
      { id: 's29', date: '2025-03-18', shift: 'off', koujimei: '有休', workers: ['青木','東'], memo: '' },
          /* ── 3/19（水） ── */
      { id: 's30', date: '2025-03-19', shift: 'day', koujimei: '80.神明町FFT-SA', workers: ['吉村','光嶋','渡辺','青木','平山'], memo: '' },
      { id: 's31', date: '2025-03-19', shift: 'day', koujimei: '北旅籠更生Bナ', workers: ['河居','織田','山田','大江','藤澤産業'], memo: '' },
      { id: 's32', date: '2025-03-19', shift: 'night', koujimei: '京都東部流域夜間', workers: ['宮前','清井','東'], memo: '' },
          /* ── 3/23（日） ── */
      { id: 's33', date: '2025-03-23', shift: 'day', koujimei: '80.神明町FFT-SA', workers: ['吉村','光嶋','渡辺','青木','平山'], memo: '' },
      { id: 's34', date: '2025-03-23', shift: 'day', koujimei: '北旅籠更生BP', workers: ['河居','織田','山田','大江','藤澤産業'], memo: '' },
          /* ── 3/25（火） ── */
      { id: 's35', date: '2025-03-25', shift: 'day', koujimei: '80.神明町FFT-SA', workers: ['吉村','光嶋','渡辺','青木','平山'], memo: '' },
      { id: 's36', date: '2025-03-25', shift: 'day', koujimei: '北旅籠更生BP', workers: ['河居','織田','山田','大江','藤澤産業'], memo: '' },
      { id: 's37', date: '2025-03-25', shift: 'day', koujimei: '農業土木', workers: ['西田','父','山本','土'], memo: '' },
          /* ── 3/27（木） ── */
      { id: 's38', date: '2025-03-27', shift: 'day', koujimei: '80.神明町FFT-SA', workers: ['吉村','光嶋','渡辺','青木','平山'], memo: '' },
      { id: 's39', date: '2025-03-27', shift: 'day', koujimei: '北旅籠更生BP', workers: ['河居','織田','山田','大江','藤澤産業'], memo: '' },
        ],
}

/** 2026年3月用サンプル（日付を 2026-03 に変換） */
export function getSampleDataForMarch2026(): ScheduleData {
    const schedules: ScheduleEntry[] = SAMPLE_DATA.schedules.map((s) => ({
          ...s,
          date: s.date.replace('2025-03', '2026-03'),
    }))
    const dayMemos: Record<string, string> = {}
        for (const [k, v] of Object.entries(SAMPLE_DATA.dayMemos)) {
              dayMemos[k.replace('2025-03', '2026-03')] = v
        }
    return {
          workers: SAMPLE_DATA.workers,
          schedules,
          dayMemos,
    }
}
