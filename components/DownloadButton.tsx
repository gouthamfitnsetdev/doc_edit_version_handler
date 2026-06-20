'use client'

import { useState } from 'react'
import { downloadAsDocx, downloadAsTxt, downloadAsPdf } from '@/lib/exporter'
import type { PdfEdits, AddedLine } from '@/lib/pdfExport'

interface Props {
  content: string
  filename: string
  pdfBytes?:    Uint8Array | null
  pdfEdits?:    PdfEdits
  pdfAddedLines?: AddedLine[]
}

export default function DownloadButton({ content, filename, pdfBytes, pdfEdits, pdfAddedLines }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const base = filename.replace(/\.[^.]+$/, '')

  async function handleDownload(format: 'docx' | 'txt' | 'pdf') {
    setOpen(false)
    setLoading(true)
    try {
      if (format === 'pdf' && pdfBytes) {
        const { downloadModifiedPdf } = await import('@/lib/pdfExport')
        await downloadModifiedPdf(pdfBytes, pdfEdits ?? {}, base, pdfAddedLines ?? [])
      } else if (format === 'docx') {
        await downloadAsDocx(content, base)
      } else if (format === 'pdf') {
        await downloadAsPdf(content, base)
      } else {
        downloadAsTxt(content, base)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={loading}
        className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
      >
        {loading ? 'Preparing…' : '⬇ Download'}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-10 w-36 overflow-hidden">
          {(['docx', 'pdf', 'txt'] as const).map(fmt => (
            <button
              key={fmt}
              onClick={() => handleDownload(fmt)}
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 uppercase font-medium text-gray-700"
            >
              .{fmt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
