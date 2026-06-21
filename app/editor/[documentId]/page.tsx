'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { supabase, Document, Version, downloadPdfFromStorage } from '@/lib/supabase'
import { getPdfBytes, storePdfBytes } from '@/lib/pdfStore'
import type { PdfEdits, AddedLine } from '@/lib/pdfExport'
import VersionSidebar from '@/components/VersionSidebar'
import { Wordmark } from '@/components/brand/wordmark'
import DiffViewer from '@/components/DiffViewer'
import DownloadButton from '@/components/DownloadButton'
import { useAuth } from '@/components/AuthProvider'

const TipTapEditor = dynamic(() => import('@/components/TipTapEditor'), { ssr: false })
const PDFCanvasEditor = dynamic(() => import('@/components/PDFCanvasEditor'), { ssr: false })

type Tab = 'edit' | 'diff'

function parsePdfContent(content: string): { html: string; edits: PdfEdits; addedLines: AddedLine[] } {
  try {
    const p = JSON.parse(content)
    if (p.__pdf__ === true) return { html: p.html ?? '', edits: p.edits ?? {}, addedLines: p.addedLines ?? [] }
  } catch {}
  return { html: content, edits: {}, addedLines: [] }
}

function buildPdfContent(html: string, edits: PdfEdits, addedLines: AddedLine[]): string {
  return JSON.stringify({ __pdf__: true, html, edits, addedLines })
}

export default function EditorPage() {
  const { documentId } = useParams<{ documentId: string }>()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const [doc, setDoc] = useState<Document | null>(null)
  const [versions, setVersions] = useState<Version[]>([])
  const [activeVersion, setActiveVersion] = useState<Version | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [tab, setTab] = useState<Tab>('edit')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pdfBytes, setPdfBytes]         = useState<Uint8Array | null>(null)
  const [pdfEdits, setPdfEdits]         = useState<PdfEdits>({})
  const [pdfAddedLines, setPdfAddedLines] = useState<AddedLine[]>([])

  useEffect(() => {
    if (authLoading) return          // wait for session to restore
    if (!user) { router.push('/'); return }  // not logged in

    async function load() {
      const { data: docData } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single()

      if (!docData) { router.push('/'); return }

      if (docData.file_type === 'pdf') {
        // 1. Try in-memory (same tab session)
        let bytes = getPdfBytes(docData.id)
        // 2. Fall back to Supabase Storage (survives refresh if bucket is set up)
        if (!bytes) {
          bytes = await downloadPdfFromStorage(docData.id)
          if (bytes) storePdfBytes(docData.id, bytes)
        }
        // 3. Still nothing — redirect cleanly instead of showing a broken half-page
        if (!bytes) {
          router.push('/')
          return
        }
        setPdfBytes(bytes)
      }

      setDoc(docData)

      const { data: versionData } = await supabase
        .from('versions')
        .select('*')
        .eq('document_id', documentId)
        .order('version_number', { ascending: true })

      const vers = versionData ?? []
      setVersions(vers)

      const latest = vers[vers.length - 1]
      if (latest) {
        setActiveVersion(latest)
        if (docData.file_type === 'pdf') {
          const { html, edits, addedLines } = parsePdfContent(latest.content)
          setEditorContent(html)
          setPdfEdits(edits)
          setPdfAddedLines(addedLines)
        } else {
          setEditorContent(latest.content)
        }
      }
      setLoading(false)
    }
    load()
  }, [documentId, router, user, authLoading])

  const handleSaveVersion = useCallback(async (label: string) => {
    if (!doc) return
    setSaving(true)
    const nextNum = versions.length + 1
    const contentToSave = doc.file_type === 'pdf'
      ? buildPdfContent(editorContent, pdfEdits, pdfAddedLines)
      : editorContent

    const { data: newVer, error } = await supabase
      .from('versions')
      .insert({
        document_id: doc.id,
        version_number: nextNum,
        content: contentToSave,
        label: label || `Version ${nextNum}`,
      })
      .select()
      .single()

    if (!error && newVer) {
      setVersions(prev => [...prev, newVer])
      setActiveVersion(newVer)
    }
    setSaving(false)
  }, [doc, versions, editorContent, pdfEdits])

  const handleSelectVersion = useCallback((version: Version) => {
    setActiveVersion(version)
    if (doc?.file_type === 'pdf') {
      const { html, edits, addedLines } = parsePdfContent(version.content)
      setEditorContent(html)
      setPdfEdits(edits)
      setPdfAddedLines(addedLines)
    } else {
      setEditorContent(version.content)
      setTab('diff')
    }
  }, [doc])

  const previousVersion = activeVersion
    ? versions.find(v => v.version_number === activeVersion.version_number - 1) ?? null
    : null

  const isPdf = doc?.file_type === 'pdf'

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-[#F8F5EF]">
      <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-[#E8E4DC]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="text-[#9CA3AF] hover:text-[#0C0C0C] transition-colors"
            title="Back to dashboard"
          >
            <Wordmark size="sm" />
          </button>
          <span className="text-[#E8E4DC]">/</span>
          <h1 className="font-medium text-[#0C0C0C] truncate max-w-xs text-sm">{doc?.name}</h1>
        </div>

        <div className="flex items-center gap-3">
          {!isPdf && (
            <div className="flex rounded-lg border border-[#E8E4DC] bg-[#F8F5EF] p-1 gap-1">
              <TabBtn active={tab === 'edit'} onClick={() => setTab('edit')}>Edit</TabBtn>
              <TabBtn active={tab === 'diff'} onClick={() => setTab('diff')}>Diff View</TabBtn>
            </div>
          )}
          {doc && (
            <DownloadButton
              content={editorContent}
              filename={doc.name}
              pdfBytes={isPdf ? pdfBytes : undefined}
              pdfEdits={isPdf ? pdfEdits : undefined}
              pdfAddedLines={isPdf ? pdfAddedLines : undefined}
            />
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 bg-white overflow-hidden flex flex-col">
          {isPdf ? (
            <PDFCanvasEditor
              pdfBytes={pdfBytes!}
              edits={pdfEdits}
              addedLines={pdfAddedLines}
              onChange={setPdfEdits}
              onLinesChange={setPdfAddedLines}
            />
          ) : tab === 'edit' ? (
            <TipTapEditor
              content={editorContent}
              onChange={setEditorContent}
              editable={true}
            />
          ) : (
            activeVersion && (
              <DiffViewer
                currentVersion={activeVersion}
                previousVersion={previousVersion}
              />
            )
          )}
        </main>

        <VersionSidebar
          versions={versions}
          activeVersionId={activeVersion?.id ?? ''}
          onSelect={handleSelectVersion}
          onSave={handleSaveVersion}
          saving={saving}
        />
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors
        ${active
          ? 'bg-white shadow-sm text-[#0C0C0C]'
          : 'text-[#9CA3AF] hover:text-[#0C0C0C]'
        }`}
    >
      {children}
    </button>
  )
}
