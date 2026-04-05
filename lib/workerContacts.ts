/**
 * 作業員連絡先（通知用）
 */
import { createClient } from '@/lib/supabase/client'

export type WorkerContact = { workerName: string; email: string }

export async function loadWorkerContacts(): Promise<Record<string, string>> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase.from('worker_contacts').select('worker_name, email')
    if (error) throw error
    const map: Record<string, string> = {}
    for (const row of data ?? []) {
      map[row.worker_name ?? ''] = row.email ?? ''
    }
    return map
  } catch (e) {
    console.error('[workerContacts] load error:', e)
    return {}
  }
}

export async function saveWorkerContact(workerName: string, email: string): Promise<void> {
  try {
    const supabase = createClient()
    await supabase.from('worker_contacts').upsert(
      { worker_name: workerName, email: email.trim(), updated_at: new Date().toISOString() },
      { onConflict: 'worker_name' }
    )
  } catch (e) {
    console.error('[workerContacts] save error:', e)
    throw e
  }
}

export async function deleteWorkerContact(workerName: string): Promise<void> {
  try {
    const supabase = createClient()
    await supabase.from('worker_contacts').delete().eq('worker_name', workerName)
  } catch (e) {
    console.error('[workerContacts] delete error:', e)
    throw e
  }
}
