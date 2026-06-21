'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, Document } from '@/lib/supabase'
import { useAuth } from '@/components/AuthProvider'
import BlurFade from '@/components/magicui/blur-fade'
import { ShimmerButton } from '@/components/magicui/shimmer-button'
import { DotPattern } from '@/components/magicui/dot-pattern'
import { MagicCard } from '@/components/magicui/magic-card'
import { Wordmark } from '@/components/brand/wordmark'

export default function HomePage() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0C0C0C]">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <LoginPage />
  return <Dashboard />
}

// ── Login ─────────────────────────────────────────────────────────────────────

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
    <div className="min-h-screen bg-[#0C0C0C] flex items-center justify-center relative overflow-hidden">
      <DotPattern
        color="rgba(255,255,255,0.25)"
        width={20}
        height={20}
        className="[mask-image:radial-gradient(560px_circle_at_center,white,transparent)]"
      />

      <div className="relative z-10 text-center px-6 max-w-lg w-full">
        <BlurFade delay={0}>
          <div className="flex justify-center mb-12">
            <Wordmark size="lg" invert />
          </div>
        </BlurFade>

        <BlurFade delay={0.12}>
          <h1
            className="text-white leading-[0.93] tracking-tight mb-14"
            style={{
              fontFamily: 'var(--font-playfair), Georgia, serif',
              fontStyle: 'italic',
              fontSize: 'clamp(60px, 10vw, 88px)',
            }}
          >
            Your documents,<br />
            beautifully<br />
            edited.
          </h1>
        </BlurFade>

        <BlurFade delay={0.26}>
          <div className="flex flex-col items-center gap-4">
            <ShimmerButton
              onClick={signIn}
              disabled={busy}
              className="px-8 py-4 text-sm font-medium"
              shimmerDuration="2.5s"
            >
              <GoogleIcon />
              {busy ? 'Redirecting…' : 'Continue with Google'}
            </ShimmerButton>
            <p className="text-[#4B4B4B] text-xs tracking-wide">
              Free · PDF, DOCX & TXT supported
            </p>
          </div>
        </BlurFade>
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function Dashboard() {
  const { user } = useAuth()
  const router = useRouter()
  const [docs, setDocs]               = useState<Document[]>([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [uploading, setUploading]     = useState(false)
  const [dragOver, setDragOver]       = useState(false)
  const [error, setError]             = useState('')

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

  const firstName = user?.user_metadata?.full_name?.split(' ')[0]
    ?? user?.email?.split('@')[0]
    ?? 'there'

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="min-h-screen bg-[#F8F5EF]">
      {/* Header */}
      <header className="bg-white border-b border-[#E8E4DC] px-6 py-3.5 flex items-center justify-between">
        <Wordmark size="md" />
        <div className="flex items-center gap-3">
          {user?.user_metadata?.avatar_url && (
            <img
              src={user.user_metadata.avatar_url}
              alt="avatar"
              className="w-7 h-7 rounded-full ring-2 ring-[#E8E4DC]"
            />
          )}
          <span className="text-sm text-[#6B7280] hidden sm:block">
            {user?.user_metadata?.full_name ?? user?.email}
          </span>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-xs text-[#9CA3AF] hover:text-[#0C0C0C] px-2.5 py-1.5 rounded-lg hover:bg-[#F0EDE6] transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        {/* Greeting */}
        <BlurFade>
          <h2
            className="text-[#0C0C0C] mb-10"
            style={{
              fontFamily: 'var(--font-playfair), Georgia, serif',
              fontSize: 'clamp(28px, 4vw, 40px)',
              fontWeight: 500,
            }}
          >
            {greeting}, {firstName}.
          </h2>
        </BlurFade>

        {/* Upload zone */}
        <BlurFade delay={0.1}>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={pickFile}
            className={`relative overflow-hidden rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-300 mb-3
              ${dragOver
                ? 'border-[#5B4FE9] bg-[#F0EEFF]'
                : 'border-[#D9D4CC] bg-white hover:border-[#5B4FE9] hover:bg-[#FDFCFB]'
              }`}
          >
            <DotPattern
              color={dragOver ? 'rgba(91,79,233,0.18)' : 'rgba(0,0,0,0.06)'}
              width={22}
              height={22}
              className="[mask-image:radial-gradient(320px_circle_at_center,white,transparent)]"
            />
            <div className="relative z-10">
              {uploading ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-7 h-7 border-2 border-[#5B4FE9]/30 border-t-[#5B4FE9] rounded-full animate-spin" />
                  <p className="text-sm text-[#6B7280]">Uploading…</p>
                </div>
              ) : (
                <>
                  <div
                    className="w-10 h-10 mx-auto mb-4 rounded-xl flex items-center justify-center text-[#5B4FE9] text-2xl font-light"
                    style={{ background: 'rgba(91,79,233,0.08)' }}
                  >
                    +
                  </div>
                  <p className="font-medium text-[#0C0C0C] text-sm mb-1">
                    {dragOver ? 'Release to upload' : 'Upload a document'}
                  </p>
                  <p className="text-xs text-[#9CA3AF]">PDF, DOCX, TXT — drag & drop or click</p>
                </>
              )}
            </div>
          </div>
          {error && (
            <p className="text-red-500 text-xs text-center mt-2 mb-4">{error}</p>
          )}
        </BlurFade>

        {/* Documents */}
        <BlurFade delay={0.2}>
          {docsLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-5 h-5 border-2 border-[#E8E4DC] border-t-[#5B4FE9] rounded-full animate-spin" />
            </div>
          ) : docs.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-[#C4BFB8] text-sm">No documents yet.</p>
              <p className="text-[#C4BFB8] text-xs mt-1">Upload one above to get started.</p>
            </div>
          ) : (
            <>
              <h3 className="text-xs font-medium text-[#9CA3AF] tracking-widest uppercase mb-4 mt-8">
                Your documents
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {docs.map((doc, i) => (
                  <BlurFade key={doc.id} delay={0.25 + i * 0.05} inView>
                    <DocCard doc={doc} onClick={() => router.push(`/editor/${doc.id}`)} />
                  </BlurFade>
                ))}
              </div>
            </>
          )}
        </BlurFade>
      </main>
    </div>
  )
}

function DocCard({ doc, onClick }: { doc: Document; onClick: () => void }) {
  const typeColors: Record<string, { bg: string; text: string }> = {
    pdf:  { bg: '#FFF0F0', text: '#E53E3E' },
    docx: { bg: '#EEF2FF', text: '#4F46E5' },
    txt:  { bg: '#F0FDF4', text: '#16A34A' },
  }
  const color = typeColors[doc.file_type] ?? { bg: '#F3F4F6', text: '#6B7280' }
  const date = new Date(doc.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  return (
    <MagicCard>
      <button
        onClick={onClick}
        className="w-full text-left p-5 group"
      >
        <div className="flex items-start justify-between mb-4">
          <span
            className="text-[10px] font-medium tracking-widest uppercase px-2 py-0.5 rounded-md"
            style={{ background: color.bg, color: color.text }}
          >
            {doc.file_type}
          </span>
        </div>
        <p
          className="font-medium text-[#0C0C0C] truncate text-sm mb-1 group-hover:text-[#5B4FE9] transition-colors duration-200"
          style={{ fontFamily: 'var(--font-inter)' }}
        >
          {doc.name}
        </p>
        <p className="text-[11px] text-[#C4BFB8]">{date}</p>
      </button>
    </MagicCard>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}
