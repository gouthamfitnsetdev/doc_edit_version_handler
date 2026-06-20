'use client'

import { useState, useRef } from 'react'
import { parseFile } from '@/lib/parsers'
import { supabase, uploadPdfToStorage } from '@/lib/supabase'
import { getSessionId } from '@/lib/session'
import { storePdfBytes } from '@/lib/pdfStore'
import { useRouter } from 'next/navigation'

const ACCEPTED = '.pdf,.docx,.txt'

export default function FileUploader() {
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  async function handleFile(file: File) {
    setError('')
    setLoading(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (!['pdf', 'docx', 'txt'].includes(ext ?? '')) {
        throw new Error('Only PDF, DOCX, and TXT files are supported.')
      }

      const content = await parseFile(file)
      const sessionId = getSessionId()

      const { data: doc, error: docErr } = await supabase
        .from('documents')
        .insert({ name: file.name, file_type: ext, session_id: sessionId })
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
        const ab = await file.arrayBuffer()
        const bytes = new Uint8Array(ab)
        storePdfBytes(doc.id, bytes)
        // Upload to Supabase Storage so it survives page refreshes (non-blocking)
        uploadPdfToStorage(doc.id, bytes).catch(console.error)
      }

      router.push(`/editor/${doc.id}`)
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong.')
      setLoading(false)
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">DocEditor</h1>
          <p className="text-gray-500 mt-2">Upload a document to start editing with version history</p>
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors
            ${dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50'}`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            className="hidden"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-600">Parsing document…</p>
            </div>
          ) : (
            <>
              <div className="text-5xl mb-4">📄</div>
              <p className="text-lg font-medium text-gray-700">
                {dragging ? 'Drop it here!' : 'Drag & drop or click to upload'}
              </p>
              <p className="text-sm text-gray-400 mt-2">PDF, DOCX, TXT supported</p>
            </>
          )}
        </div>

        {error && (
          <p className="mt-4 text-center text-red-600 text-sm">{error}</p>
        )}
      </div>
    </div>
  )
}
