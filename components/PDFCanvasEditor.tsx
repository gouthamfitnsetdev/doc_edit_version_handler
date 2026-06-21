'use client'

import { useEffect, useRef, useState } from 'react'
import type { PdfEdits, AddedLine } from '@/lib/pdfExport'

const SCALE       = 1.5
const DEFAULT_FS  = 12 * SCALE   // default font size for new lines

type ScreenItem = {
  str: string
  x: number
  y: number
  width: number
  height: number
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

type ActiveEdit =
  | { kind: 'existing'; pageIndex: number; itemIndex: number; x: number; y: number; width: number; fontSize: number; bold: boolean; italic: boolean; fontName: string; text: string }
  | { kind: 'new';      pageIndex: number; x: number; y: number; fontSize: number; lineId: string | null; text: string }

interface Props {
  pdfBytes:    Uint8Array
  edits:       PdfEdits
  addedLines:  AddedLine[]
  onChange:    (edits: PdfEdits) => void
  onLinesChange: (lines: AddedLine[]) => void
}

function fontFamily(fontName: string) {
  return /cmr|roman|times|palatino|bookman|garamond|serif/i.test(fontName)
    ? 'Georgia, "Times New Roman", serif'
    : 'Arial, Helvetica, sans-serif'
}

export default function PDFCanvasEditor({ pdfBytes, edits, addedLines, onChange, onLinesChange }: Props) {
  const [pageInfos, setPageInfos] = useState<PageInfo[]>([])
  const [loading, setLoading]     = useState(true)
  const [active, setActive]       = useState<ActiveEdit | null>(null)
  const [viewScale, setViewScale] = useState(1)

  const canvasRefs   = useRef<(HTMLCanvasElement | null)[]>([])
  const offscreenRef = useRef<(HTMLCanvasElement | null)[]>([])
  const pageObjsRef  = useRef<Array<{ page: any; viewport: any }>>([])

  // Compute scale to fit PDF page within the viewport width
  useEffect(() => {
    if (!pageInfos.length) return
    const maxW = pageInfos[0].width
    const available = window.innerWidth - 32 // 16px padding each side
    setViewScale(available < maxW ? available / maxW : 1)

    const onResize = () => {
      const avail = window.innerWidth - 32
      setViewScale(avail < maxW ? avail / maxW : 1)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [pageInfos])

  // ── 1. Load PDF ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setActive(null)
    setPageInfos([])

    async function load() {
      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
      const pdf = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise
      if (cancelled) return

      const infos: PageInfo[] = []
      const objs:  Array<{ page: any; viewport: any }> = []

      for (let p = 1; p <= pdf.numPages; p++) {
        if (cancelled) break
        const page     = await pdf.getPage(p)
        const viewport = page.getViewport({ scale: SCALE })
        const text     = await page.getTextContent()
        const items: ScreenItem[] = []

        for (const it of text.items as any[]) {
          if (!('str' in it) || !it.str.trim()) continue
          const [vx, vy]  = (viewport as any).convertToViewportPoint(it.transform[4], it.transform[5])
          const sf        = (Math.abs(it.transform[3]) || Math.abs(it.transform[0]) || 10) * SCALE
          const fn: string = it.fontName ?? ''
          items.push({
            str:      it.str,
            x:        vx,
            y:        vy - sf * 0.88,
            width:    Math.max((it.width || 0) * SCALE, sf * 0.6 * it.str.length),
            height:   sf * 1.2,
            fontSize: sf,
            bold:     /bold|heavy|black|cmbx|sfb/i.test(fn),
            italic:   /italic|oblique|slant/i.test(fn),
            fontName: fn,
          })
        }
        infos.push({ width: viewport.width, height: viewport.height, items })
        objs.push({ page, viewport })
      }

      if (!cancelled) {
        pageObjsRef.current = objs
        setPageInfos(infos)
        setLoading(false)
      }
    }

    load().catch(err => { console.error(err); if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [pdfBytes])

  // ── 2. Bake offscreen canvases once ────────────────────────────────────────
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
        offscreenRef.current[i] = off
        const ctx = off.getContext('2d')
        if (!ctx) continue
        try { await po.page.render({ canvasContext: ctx, viewport: po.viewport }).promise } catch { /* ok */ }
      }
      if (!cancelled) redraw()
    }
    bake()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageInfos])

  // ── 3. Redraw on every edits/addedLines change ─────────────────────────────
  function redraw() {
    for (let i = 0; i < pageInfos.length; i++) {
      const canvas = canvasRefs.current[i]
      const off    = offscreenRef.current[i]
      if (!canvas || !off) continue
      const ctx = canvas.getContext('2d')
      if (!ctx) continue

      ctx.drawImage(off, 0, 0)   // restore original PDF

      // Draw existing-text edits
      const pageEdits = edits[i]
      if (pageEdits) {
        for (const [idxStr, newText] of Object.entries(pageEdits)) {
          const it = pageInfos[i].items[Number(idxStr)]
          if (!it) continue
          const ff = fontFamily(it.fontName)
          ctx.font = `${it.italic ? 'italic ' : ''}${it.bold ? 'bold ' : ''}${it.fontSize}px ${ff}`
          const eraseW = Math.max(it.width, ctx.measureText(it.str).width) + 16
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(it.x - 4, it.y - 2, eraseW, it.fontSize * 1.3)
          ctx.fillStyle = '#000000'
          ctx.fillText(newText, it.x, it.y + it.fontSize * 0.88)
        }
      }

      // Draw added lines
      for (const line of addedLines.filter(l => l.pageIndex === i)) {
        const ff = fontFamily(line.italic ? 'italic' : '')
        ctx.font      = `${line.italic ? 'italic ' : ''}${line.bold ? 'bold ' : ''}${line.fontSize}px ${ff}`
        ctx.fillStyle = '#000000'
        ctx.fillText(line.text, line.x, line.y + line.fontSize * 0.88)
      }
    }
  }

  useEffect(() => { if (pageInfos.length) redraw() }, [edits, addedLines])   // eslint-disable-line react-hooks/exhaustive-deps

  // ── 4. Click handling ──────────────────────────────────────────────────────
  function handleClick(e: React.MouseEvent<HTMLDivElement>, pageIndex: number, scale = 1) {
    const rect = e.currentTarget.getBoundingClientRect()
    // divide by scale because the inner div is CSS-scaled, not DOM-scaled
    const cx = (e.clientX - rect.left) / scale
    const cy = (e.clientY - rect.top) / scale
    const pad = 6

    // Check existing PDF text items
    const items = pageInfos[pageIndex].items
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (cx >= it.x - pad && cx <= it.x + it.width + pad &&
          cy >= it.y - pad && cy <= it.y + it.height + pad) {
        setActive({
          kind: 'existing', pageIndex, itemIndex: i,
          x: it.x, y: it.y, width: it.width,
          fontSize: it.fontSize, bold: it.bold, italic: it.italic, fontName: it.fontName,
          text: edits[pageIndex]?.[i] ?? it.str,
        })
        return
      }
    }

    // Check already-added lines
    for (const line of addedLines.filter(l => l.pageIndex === pageIndex)) {
      const w = line.fontSize * 0.6 * (line.text.length || 1)
      if (cx >= line.x - pad && cx <= line.x + w + pad &&
          cy >= line.y - pad && cy <= line.y + line.fontSize + pad) {
        setActive({ kind: 'new', pageIndex, x: line.x, y: line.y, fontSize: line.fontSize, lineId: line.id, text: line.text })
        return
      }
    }

    // Click on empty space → create new line
    setActive({ kind: 'new', pageIndex, x: cx, y: cy - DEFAULT_FS * 0.88, fontSize: DEFAULT_FS, lineId: null, text: '' })
  }

  function commitExisting(newText: string) {
    if (!active || active.kind !== 'existing') return
    const { pageIndex, itemIndex } = active
    onChange({ ...edits, [pageIndex]: { ...(edits[pageIndex] ?? {}), [itemIndex]: newText } })
    setActive(null)
  }

  function commitNew(newText: string) {
    if (!active || active.kind !== 'new') return
    const trimmed = newText.trim()

    if (active.lineId) {
      // Edit or delete an existing added line
      const updated = trimmed
        ? addedLines.map(l => l.id === active.lineId ? { ...l, text: trimmed } : l)
        : addedLines.filter(l => l.id !== active.lineId)
      onLinesChange(updated)
    } else if (trimmed) {
      // Brand-new line
      const line: AddedLine = {
        id:        crypto.randomUUID(),
        pageIndex: active.pageIndex,
        x:         active.x,
        y:         active.y,
        text:      trimmed,
        fontSize:  active.fontSize,
        bold:      false,
        italic:    false,
      }
      onLinesChange([...addedLines, line])
    }
    setActive(null)
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
    <div className="flex flex-col items-center gap-6 py-6 px-4 overflow-auto bg-[#6B7280] h-full">
      <p className="text-xs text-white/90 bg-black/40 px-3 py-1 rounded-full select-none text-center">
        Click text to edit · Click empty space to add line · Enter to confirm · Esc to cancel
      </p>

      {pageInfos.map((info, pageIndex) => (
        <div
          key={pageIndex}
          style={{
            width: info.width * viewScale,
            height: info.height * viewScale,
            flexShrink: 0,
            position: 'relative',
          }}
          className="shadow-2xl"
        >
          {/* inner div holds true canvas size, scaled via CSS transform */}
          <div
            style={{
              position: 'absolute',
              top: 0, left: 0,
              width: info.width,
              height: info.height,
              transform: `scale(${viewScale})`,
              transformOrigin: 'top left',
            }}
            onClick={e => handleClick(e, pageIndex, viewScale)}
          >
          <canvas
            width={info.width}
            height={info.height}
            ref={el => { canvasRefs.current[pageIndex] = el }}
            style={{ display: 'block' }}
          />

          {/* Active edit overlay */}
          {active?.pageIndex === pageIndex && (() => {
            const isNew    = active.kind === 'new'
            const ff       = isNew ? 'Arial, Helvetica, sans-serif' : fontFamily((active as any).fontName ?? '')
            const bold     = isNew ? false : (active as any).bold
            const italic   = isNew ? false : (active as any).italic
            const fs       = active.fontSize
            const h        = fs * 1.3
            const inputW   = isNew ? 220 : Math.max((active as any).width ?? 80, 80)
            const commit   = isNew ? commitNew : commitExisting

            return (
              <>
                <div style={{
                  position: 'absolute',
                  left: active.x - 4, top: active.y - 2,
                  width: inputW + 16, height: h,
                  background: 'white', zIndex: 9, pointerEvents: 'none',
                  border: isNew ? '1.5px dashed #94a3b8' : 'none',
                  borderRadius: 3,
                }} />
                <input
                  autoFocus
                  defaultValue={active.text}
                  placeholder={isNew ? 'Type new text…' : undefined}
                  style={{
                    position:    'absolute',
                    left:        active.x,
                    top:         active.y - 2,
                    width:       inputW + 8,
                    height:      h,
                    fontSize:    fs,
                    fontWeight:  bold   ? 'bold'   : 'normal',
                    fontStyle:   italic ? 'italic' : 'normal',
                    fontFamily:  ff,
                    color:       '#000',
                    lineHeight:  `${h}px`,
                    border:      `2px solid ${isNew ? '#94a3b8' : '#3b82f6'}`,
                    borderRadius: 3,
                    background:  'transparent',
                    padding:     '0 4px',
                    outline:     'none',
                    zIndex:      10,
                    boxSizing:   'border-box',
                  }}
                  onBlur={e  => commit(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commit((e.target as HTMLInputElement).value)
                    if (e.key === 'Escape') setActive(null)
                  }}
                />
              </>
            )
          })()}
          </div>
        </div>
      ))}
    </div>
  )
}
