'use client'

export async function parseFile(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase()

  if (ext === 'txt') {
    return parseTxt(file)
  } else if (ext === 'docx') {
    return parseDocx(file)
  } else if (ext === 'pdf') {
    return parsePdf(file)
  }
  throw new Error(`Unsupported file type: .${ext}`)
}

async function parseTxt(file: File): Promise<string> {
  const text = await file.text()
  return text
    .split('\n')
    .map(line => `<p>${line || '<br>'}</p>`)
    .join('')
}

async function parseDocx(file: File): Promise<string> {
  const mammoth = (await import('mammoth')).default
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.convertToHtml({ arrayBuffer })
  return result.value
}

type PdfItem = {
  str: string
  x: number
  y: number
  w: number
  size: number
  bold: boolean
}

async function parsePdf(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const parts: string[] = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const viewport = page.getViewport({ scale: 1 })
    const pageWidth = viewport.width
    const content = await page.getTextContent()

    const rawItems: PdfItem[] = (content.items as any[])
      .filter(it => 'str' in it && it.str.trim())
      .map(it => ({
        str: it.str as string,
        x: it.transform[4] as number,
        y: it.transform[5] as number,
        w: (it.width ?? 0) as number,
        size: Math.abs(it.transform[3]) as number,
        // Bold: check font name for common descriptors incl. LaTeX CMBx/sfb
        bold: /bold|heavy|black|cmbx|sfb/i.test(it.fontName ?? ''),
      }))

    if (!rawItems.length) continue

    // Group items into lines by Y coordinate (3-unit ≈ 1pt tolerance)
    const lineGroups: PdfItem[][] = []
    for (const item of rawItems) {
      const existing = lineGroups.find(g => Math.abs(g[0].y - item.y) < 3)
      if (existing) existing.push(item)
      else lineGroups.push([item])
    }

    // Sort lines top→bottom, items within each line left→right
    lineGroups.sort((a, b) => b[0].y - a[0].y)
    for (const g of lineGroups) g.sort((a, b) => a.x - b.x)

    // Median font size = body text baseline for ratio comparisons
    const allSizes = rawItems.map(i => i.size).sort((a, b) => a - b)
    const bodySize = allSizes[Math.floor(allSizes.length / 2)] || 10

    let listOpen = false

    const closeList = () => {
      if (listOpen) { parts.push('</ul>'); listOpen = false }
    }

    for (const group of lineGroups) {
      const text = buildText(group)
      if (!text) continue

      const maxSize = Math.max(...group.map(i => i.size))
      const bold = group.some(i => i.bold)

      // Two-column detection happens before everything else so bullets with
      // right-aligned dates are handled correctly
      const { left: leftGroup, right: rightGroup } = splitColumns(group, pageWidth)
      const twoCol = rightGroup.length > 0

      const rawFirst = text[0]
      const isBullet = rawFirst === '•' || rawFirst === '●' || rawFirst === '◦'
      const isDash = rawFirst === '–' || rawFirst === '—'

      if (!isBullet && !isDash) closeList()

      if (maxSize >= bodySize * 1.8) {
        // ── Large text: main heading (name)
        parts.push(`<h1>${esc(text)}</h1>`)
      } else if (isAllCapsSection(text)) {
        // ── ALL-CAPS short word(s): section header
        closeList()
        parts.push(`<h2>${esc(text)}</h2>`)
      } else if (isBullet) {
        if (!listOpen) { parts.push('<ul>'); listOpen = true }

        if (twoCol) {
          // Bullet with right-aligned date (e.g. "• Job Title  2009 – 2026")
          const itemText = buildText(leftGroup).replace(/^[•●◦]\s*/, '')
          const rightText = buildText(rightGroup)
          const lb = leftGroup.some(i => i.bold)
          const inner = lb ? `<strong>${esc(itemText)}</strong>` : esc(itemText)
          parts.push(`<li>${inner}&nbsp;&nbsp;<em>${esc(rightText)}</em></li>`)
        } else {
          const inner = text.replace(/^[•●◦]\s*/, '')
          parts.push(`<li>${bold ? `<strong>${esc(inner)}</strong>` : esc(inner)}</li>`)
        }
      } else if (isDash) {
        // ── Sub-bullet with em-dash
        if (!listOpen) { parts.push('<ul>'); listOpen = true }
        parts.push(`<li>${esc(text.replace(/^[–—]\s*/, ''))}</li>`)
      } else if (twoCol) {
        // ── Two-column non-bullet (standalone job title + date row)
        const leftText = buildText(leftGroup)
        const rightText = buildText(rightGroup)
        const lb = leftGroup.some(i => i.bold)
        const inner = lb ? `<strong>${esc(leftText)}</strong>` : esc(leftText)
        parts.push(`<p>${inner}&nbsp;&nbsp;<em>${esc(rightText)}</em></p>`)
      } else if (bold) {
        parts.push(`<p><strong>${esc(text)}</strong></p>`)
      } else {
        parts.push(`<p>${esc(text)}</p>`)
      }
    }

    closeList()
  }

  return parts.join('')
}

/** Join items, inserting a space when the gap is wider than ¼ of the font size. */
function buildText(items: PdfItem[]): string {
  if (!items.length) return ''
  let out = items[0].str
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1]
    const gap = items[i].x - (prev.x + prev.w)
    if (gap > prev.size * 0.25) out += ' '
    out += items[i].str
  }
  return out.trim()
}

/**
 * Split a line into left and right columns when the largest inter-item gap
 * exceeds 15% of the page width (catches typical resume date-on-right layouts).
 */
function splitColumns(
  items: PdfItem[],
  pageWidth: number,
): { left: PdfItem[]; right: PdfItem[] } {
  if (items.length < 2) return { left: items, right: [] }

  let maxGap = 0
  let splitAt = -1
  for (let i = 1; i < items.length; i++) {
    const gap = items[i].x - (items[i - 1].x + items[i - 1].w)
    if (gap > maxGap) { maxGap = gap; splitAt = i }
  }

  if (splitAt !== -1 && maxGap > pageWidth * 0.15) {
    return { left: items.slice(0, splitAt), right: items.slice(splitAt) }
  }
  return { left: items, right: [] }
}

/** Section header: ALL-CAPS words only, 3–30 chars, no digits. */
function isAllCapsSection(text: string): boolean {
  return (
    text.length >= 3 &&
    text.length <= 30 &&
    /^[A-Z][A-Z\s]+$/.test(text) &&
    !/\d/.test(text)
  )
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
