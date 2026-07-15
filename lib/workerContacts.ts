/**
 * 作業員連絡先（通知用）
 */
import { createClient } from '@/lib/supabase/client'
import { requireCompanyId } from '@/lib/tenant'

export type WorkerContact = { workerName: string; email: string }

export async function loadWorkerContacts(): Promise<Record<string, string>> {
  try {
    const supabase = createClient()
    const companyId = await requireCompanyId()
    const { data, error } = await supabase
      .from('worker_contacts')
      .select('worker_name, email')
      .eq('company_id', companyId)
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
    const companyId = await requireCompanyId()
    await supabase.from('worker_contacts').upsert(
      {
        company_id: companyId,
        worker_name: workerName,
        email: email.trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'company_id,worker_name' }
    )
  } catch (e) {
    console.error('[workerContacts] save error:', e)
    throw e
  }
}

export async function deleteWorkerContact(workerName: string): Promise<void> {
  try {
    const supabase = createClient()
    const companyId = await requireCompanyId()
    await supabase
      .from('worker_contacts')
      .delete()
      .eq('company_id', companyId)
      .eq('worker_name', workerName)
  } catch (e) {
    console.error('[workerContacts] delete error:', e)
    throw e
  }
}
