export type PdfEdits = Record<number, Record<number, string>>

export type AddedLine = {
  id: string
  pageIndex: number
  x: number
  y: number
  text: string
  fontSize: number
  bold: boolean
  italic: boolean
}

export async function downloadModifiedPdf(
  pdfBytes: Uint8Array,
  edits: PdfEdits,
  filename: string,
  addedLines: AddedLine[] = [],
) {
  const SCALE = 2

  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  const { jsPDF } = await import('jspdf')

  const pdf = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise

  let doc: InstanceType<typeof jsPDF> | null = null

  for (let p = 1; p <= pdf.numPages; p++) {
    const page     = await pdf.getPage(p)
    const viewport = page.getViewport({ scale: SCALE })

    const canvas = document.createElement('canvas')
    canvas.width  = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!
    await (page as any).render({ canvasContext: ctx, viewport }).promise

    // Draw edits to existing text items
    const pageEdits = edits[p - 1]
    if (pageEdits && Object.keys(pageEdits).length > 0) {
      const textContent = await page.getTextContent()
      const items = (textContent.items as any[]).filter(it => 'str' in it && it.str.trim())

      for (const [idxStr, newText] of Object.entries(pageEdits)) {
        const idx = Number(idxStr)
        const it  = items[idx]
        if (!it) continue

        const fontSizePt = Math.abs(it.transform[3]) || Math.abs(it.transform[0]) || 10
        const [vx, vy]   = (viewport as any).convertToViewportPoint(it.transform[4], it.transform[5])
        const sfont = fontSizePt * SCALE
        const sw    = Math.max((it.width || 0) * SCALE, sfont * 0.55 * it.str.length) + 16

        ctx.fillStyle = '#ffffff'
        ctx.fillRect(vx - 4, vy - sfont * 0.88 - 2, sw, sfont * 1.3)
        ctx.fillStyle = '#000000'
        ctx.font = `${sfont}px sans-serif`
        ctx.fillText(newText, vx, vy)
      }
    }

    // Draw added lines
    for (const line of addedLines.filter(l => l.pageIndex === p - 1)) {
      const exportFontSize = line.fontSize * (SCALE / 1.5)
      const fontDecl = `${line.italic ? 'italic ' : ''}${line.bold ? 'bold ' : ''}${exportFontSize}px sans-serif`
      ctx.font      = fontDecl
      ctx.fillStyle = '#000000'
      ctx.fillText(line.text, line.x * (SCALE / 1.5), (line.y + exportFontSize * 0.88) * (SCALE / 1.5))
    }

    const ptW = viewport.width  / SCALE
    const ptH = viewport.height / SCALE
    const img = canvas.toDataURL('image/jpeg', 0.92)

    if (!doc) {
      doc = new jsPDF({ unit: 'pt', format: [ptW, ptH], compress: true })
    } else {
      doc.addPage([ptW, ptH])
    }

    doc.addImage(img, 'JPEG', 0, 0, ptW, ptH)
  }

  if (doc) doc.save(`${filename.replace(/\.[^.]+$/, '')}.pdf`)
}
