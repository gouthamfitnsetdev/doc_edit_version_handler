'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, Document } from '@/lib/supabase'
import { useAuth } from '@/components/AuthProvider'

export default function HomePage() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <LoginPage />
  return <Dashboard />
}

// ── Login ────────────────────────────────────────────────────────────────────

function LoginPage() {
  const [busy, setBusy] = useState(false)

  async function signIn() {
    setBusy(true)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    setBusy(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-xl p-10 w-full max-w-md text-center">
        <div className="text-5xl mb-4">📄</div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">DocEditor</h1>
        <p className="text-gray-500 mb-8">
          Upload PDFs, DOCX, or TXT files — edit them visually and track every version.
        </p>
        <button
          onClick={signIn}
          disabled={busy}
          className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-white border-2 border-gray-200 rounded-xl text-gray-700 font-medium hover:border-blue-400 hover:bg-blue-50 transition-all disabled:opacity-50"
        >
          <GoogleIcon />
          {busy ? 'Redirecting…' : 'Continue with Google'}
        </button>
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function Dashboard() {
  const { user } = useAuth()
  const router   = useRouter()
  const [docs, setDocs]       = useState<Document[]>([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver]   = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (!user) return
    supabase
      .from('documents')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setDocs(data ?? [])
        setDocsLoading(false)
      })
  }, [user])

  async function handleFile(file: File) {
    setError('')
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      if (!['pdf', 'docx', 'txt'].includes(ext)) {
        throw new Error('Only PDF, DOCX, and TXT files are supported.')
      }

      const { parseFile } = await import('@/lib/parsers')
      const content = await parseFile(file)

      const { data: doc, error: docErr } = await supabase
        .from('documents')
        .insert({ name: file.name, file_type: ext, user_id: user!.id })
        .select()
        .single()
      if (docErr) throw docErr

      const { error: verErr } = await supabase.from('versions').insert({
        document_id: doc.id,
        version_number: 1,
        content,
        label: 'Version 1 (original)',
      })
      if (verErr) throw verErr

      if (ext === 'pdf') {
        const { storePdfBytes } = await import('@/lib/pdfStore')
        const { uploadPdfToStorage } = await import('@/lib/supabase')
        const bytes = new Uint8Array(await file.arrayBuffer())
        storePdfBytes(doc.id, bytes)
        uploadPdfToStorage(doc.id, bytes).catch(console.error)
      }

      router.push(`/editor/${doc.id}`)
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong.')
      setUploading(false)
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function pickFile() {
    if (uploading) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf,.docx,.txt'
    input.onchange = e => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) handleFile(file)
    }
    input.click()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📄</span>
          <h1 className="text-xl font-bold text-gray-900">DocEditor</h1>
        </div>
        <div className="flex items-center gap-3">
          {user?.user_metadata?.avatar_url && (
            <img
              src={user.user_metadata.avatar_url}
              alt="avatar"
              className="w-8 h-8 rounded-full"
            />
          )}
          <span className="text-sm text-gray-600 hidden sm:block">
            {user?.user_metadata?.full_name ?? user?.email}
          </span>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-sm text-gray-400 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Upload zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={pickFile}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all mb-10
            ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50'}`}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-500 text-sm">Uploading…</p>
            </div>
          ) : (
            <>
              <div className="text-4xl mb-2 text-gray-300">+</div>
              <p className="font-medium text-gray-700">
                {dragOver ? 'Drop it!' : 'Upload new document'}
              </p>
              <p className="text-sm text-gray-400 mt-1">PDF, DOCX, TXT — drag & drop or click</p>
            </>
          )}
        </div>
        {error && <p className="text-red-500 text-sm text-center -mt-6 mb-6">{error}</p>}

        {/* Documents list */}
        {docsLoading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : docs.length === 0 ? (
          <p className="text-center text-gray-400 py-10">
            No documents yet — upload one above to get started.
          </p>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-gray-700 mb-4">Your documents</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {docs.map(doc => (
                <DocCard
                  key={doc.id}
                  doc={doc}
                  onClick={() => router.push(`/editor/${doc.id}`)}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function DocCard({ doc, onClick }: { doc: Document; onClick: () => void }) {
  const icons: Record<string, string> = { pdf: '📄', docx: '📝', txt: '📃' }
  const date = new Date(doc.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  return (
    <button
      onClick={onClick}
      className="text-left bg-white rounded-2xl border border-gray-200 p-5 hover:border-blue-400 hover:shadow-md transition-all group"
    >
      <div className="text-3xl mb-3">{icons[doc.file_type] ?? '📄'}</div>
      <p className="font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
        {doc.name}
      </p>
      <p className="text-xs text-gray-400 mt-1 uppercase tracking-wide">{doc.file_type}</p>
      <p className="text-xs text-gray-400 mt-2">{date}</p>
    </button>
  )
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}
