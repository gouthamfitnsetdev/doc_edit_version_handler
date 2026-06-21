import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { detectSessionFromUrl: true, persistSession: true },
})

export type Document = {
  id: string
  name: string
  file_type: string
  user_id: string
  created_at: string
}

export type Version = {
  id: string
  document_id: string
  version_number: number
  content: string
  label: string | null
  created_at: string
}

export async function uploadPdfToStorage(docId: string, bytes: Uint8Array): Promise<void> {
  await supabase.storage
    .from('pdf-files')
    .upload(`${docId}.pdf`, bytes, { contentType: 'application/pdf', upsert: true })
}

export async function downloadPdfFromStorage(docId: string): Promise<Uint8Array | null> {
  const { data, error } = await supabase.storage
    .from('pdf-files')
    .download(`${docId}.pdf`)
  if (error || !data) return null
  return new Uint8Array(await data.arrayBuffer())
}
