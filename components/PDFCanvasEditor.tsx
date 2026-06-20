'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { PdfEdits } from '@/lib/pdfExport'

const SCALE = 1.5

type ScreenItem = {
  str: string
  x: number
  y: number        // top of glyph (canvas coords)
  width: number
  height: number   // used for click hit-zone only (generous)
  fontSize: number
  bold: boolean
  italic: boolean
  fontName: string
}

type PageInfo = {
  width: number
  height: number
  items: ScreenItem[]
}

interface Props {
  pdfBytes: Uint8Array
  edits: PdfEdits
  onChange: (edits: PdfEdits) => void
}

export default function PDFCanvasEditor({ pdfBytes, edits, onChange }: Props) {
  const [pageInfos, setPageInfos] = useState<PageInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [activeEdit, setActiveEdit] = useState<{
    pageIndex: number
    itemIndex: number
    x: number; y: number; width: number
    fontSize: number; bold: boolean; italic: boolean; fontName: string
    text: string
  } | null>(null)

  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([])
  const offscreenRefs = useRef<(HTMLCanvasElement | null)[]>([])
  const pageObjsRef = useRef<Array<{ page: any; viewport: any }>>([])

  // ── 1. Load PDF and extract text item positions ───────────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setActiveEdit(null)
    setPageInfos([])

    async function load() {
      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

      const pdf = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise
      if (cancelled) return

      const infos: PageInfo[] = []
      const pageObjs: Array<{ page: any; viewport: any }> = []

      for (let p = 1; p <= pdf.numPages; p++) {
        if (cancelled) break
        const page = await pdf.getPage(p)
        const viewport = page.getViewport({ scale: SCALE })
        const textContent = await page.getTextContent()

        const items: ScreenItem[] = []
        for (const it of textContent.items as any[]) {
          if (!('str' in it) || !it.str.trim()) continue

          const [vx, vy] = (viewport as any).convertToViewportPoint(
            it.transform[4], it.transform[5],
          )
          const fontSizePt = Math.abs(it.transform[3]) || Math.abs(it.transform[0]) || 10
          const sf = fontSizePt * SCALE
          const fontName: string = it.fontName ?? ''

          items.push({
            str: it.str,
            x: vx,
            y: vy - sf * 0.88,                          // baseline → glyph top
            width: Math.max((it.width || 0) * SCALE, sf * 0.6 * it.str.length),
            height: sf * 1.2,                            // generous click zone
            fontSize: sf,
            bold: /bold|heavy|black|cmbx|sfb/i.test(fontName),
            italic: /italic|oblique|slant/i.test(fontName),
            fontName,
          })
        }

        infos.push({ width: viewport.width, height: viewport.height, items })
        pageObjs.push({ page, viewport })
      }

      if (!cancelled) {
        pageObjsRef.current = pageObjs
        setPageInfos(infos)
        setLoading(false)
      }
    }

    load().catch(err => {
      console.error('PDF load error:', err)
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
  }, [pdfBytes])

  // ── 2a. Initial render — bake each page into an offscreen canvas once ───────
  useEffect(() => {
    if (!pageInfos.length) return
    let cancelled = false

    async function bake() {
      for (let i = 0; i < pageInfos.length; i++) {
        if (cancelled) break
        const po = pageObjsRef.current[i]
        if (!po) continue

        const off = document.createElement('canvas')
        off.width  = pageInfos[i].width
        off.height = pageInfos[i].height
        offscreenRefs.current[i] = off

        const ctx = off.getContext('2d')
        if (!ctx) continue
        try {
          await po.page.render({ canvasContext: ctx, viewport: po.viewport }).promise
        } catch { continue }
      }
      if (!cancelled) applyEdits()
    }

    bake()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageInfos])

  // ── 2b. Re-apply edits whenever edits prop changes ────────────────────────
  function applyEdits() {
    for (let i = 0; i < pageInfos.length; i++) {
      const canvas  = canvasRefs.current[i]
      const off     = offscreenRefs.current[i]
      if (!canvas || !off) continue
      const ctx = canvas.getContext('2d')
      if (!ctx) continue

      // Restore the pristine PDF render
      ctx.drawImage(off, 0, 0)

      const pageEdits = edits[i]
      if (!pageEdits) continue

      for (const [idxStr, newText] of Object.entries(pageEdits)) {
        const idx = Number(idxStr)
        const it = pageInfos[i].items[idx]
        if (!it) continue

        // Detect serif vs sans-serif from the pdf.js font name so edited text
        // visually matches the surrounding characters as closely as possible.
        const fontFamily = /cmr|roman|times|palatino|bookman|garamond|serif/i.test(it.fontName ?? '')
          ? 'Georgia, "Times New Roman", serif'
          : 'Arial, Helvetica, sans-serif'
        const fontDecl = `${it.italic ? 'italic ' : ''}${it.bold ? 'bold ' : ''}${it.fontSize}px ${fontFamily}`

        // Measure original text width so the eraser is wide enough.
        ctx.font = fontDecl
        const measuredW = ctx.measureText(it.str).width
        const eraseW = Math.max(it.width, measuredW) + 16

        // Eraser height must cover ascenders AND descenders.
        // Descenders (g, y, j, p, q) reach ~25% of fontSize below the baseline.
        // Eraser top is 2px above the stored glyph-top; height covers cap-top → descender-bottom.
        const eraseH = it.fontSize * 1.3

        ctx.fillStyle = '#ffffff'
        ctx.fillRect(it.x - 4, it.y - 2, eraseW, eraseH)

        ctx.fillStyle = '#000000'
        ctx.fillText(newText, it.x, it.y + it.fontSize * 0.88)
      }
    }
  }

  useEffect(() => {
    if (pageInfos.length) applyEdits()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edits])

  // ── 3. Click to edit ───────────────────────────────────────────────────────
  function handlePageClick(e: React.MouseEvent<HTMLDivElement>, pageIndex: number) {
    const rect = e.currentTarget.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const items = pageInfos[pageIndex].items
    const pad = 6

    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (
        cx >= it.x - pad && cx <= it.x + it.width + pad &&
        cy >= it.y - pad && cy <= it.y + it.height + pad
      ) {
        const current = edits[pageIndex]?.[i] ?? it.str
        setActiveEdit({
          pageIndex, itemIndex: i,
          x: it.x, y: it.y, width: it.width,
          fontSize: it.fontSize, bold: it.bold, italic: it.italic, fontName: it.fontName,
          text: current,
        })
        return
      }
    }
    setActiveEdit(null)
  }

  function commitEdit(newText: string) {
    if (!activeEdit) return
    const { pageIndex, itemIndex } = activeEdit
    onChange({
      ...edits,
      [pageIndex]: { ...(edits[pageIndex] ?? {}), [itemIndex]: newText },
    })
    setActiveEdit(null)
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Rendering PDF…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-6 py-6 px-4 overflow-auto bg-gray-400 h-full">
      <p className="text-xs text-white/90 bg-black/40 px-3 py-1 rounded-full select-none">
        Click any text to edit · Enter to confirm · Esc to cancel
      </p>

      {pageInfos.map((info, pageIndex) => (
        <div
          key={pageIndex}
          style={{ position: 'relative', width: info.width, height: info.height, flexShrink: 0 }}
          className="shadow-2xl"
          onClick={e => handlePageClick(e, pageIndex)}
        >
          {/* All text — original + committed edits — lives on this canvas */}
          <canvas
            width={info.width}
            height={info.height}
            ref={el => { canvasRefs.current[pageIndex] = el }}
            style={{ display: 'block' }}
          />

          {/* Only the ACTIVE (in-progress) edit gets an HTML overlay.
              On commit it is drawn to the canvas and this disappears. */}
          {activeEdit?.pageIndex === pageIndex && (() => {
            const ae = activeEdit
            const inputW = Math.max(ae.width, 80)
            // Use the same tall eraser so descenders are fully hidden during editing
            const h = ae.fontSize * 1.3
            const fontFamily = /cmr|roman|times|palatino|bookman|garamond|serif/i.test(ae.fontName ?? '')
              ? 'Georgia, "Times New Roman", serif'
              : 'Arial, Helvetica, sans-serif'
            return (
              <>
                {/* White eraser behind the input */}
                <div style={{
                  position: 'absolute',
                  left: ae.x - 4,
                  top: ae.y - 2,
                  width: inputW + 16,
                  height: h,
                  background: 'white',
                  zIndex: 9,
                  pointerEvents: 'none',
                }} />
                <input
                  autoFocus
                  defaultValue={ae.text}
                  style={{
                    position: 'absolute',
                    left: ae.x,
                    top: ae.y - 2,
                    width: inputW + 8,
                    height: h,
                    fontSize: ae.fontSize,
                    fontWeight: ae.bold ? 'bold' : 'normal',
                    fontStyle: ae.italic ? 'italic' : 'normal',
                    fontFamily,
                    color: '#000',
                    lineHeight: `${h}px`,
                    border: '2px solid #3b82f6',
                    borderRadius: 2,
                    background: 'transparent',
                    padding: '0 2px',
                    outline: 'none',
                    zIndex: 10,
                    boxSizing: 'border-box',
                  }}
                  onBlur={e => commitEdit(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitEdit((e.target as HTMLInputElement).value)
                    if (e.key === 'Escape') setActiveEdit(null)
                  }}
                />
              </>
            )
          })()}
        </div>
      ))}
    </div>
  )
}
