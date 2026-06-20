import { NextRequest, NextResponse } from 'next/server'
import htmlToDocx from 'html-to-docx'

export async function POST(req: NextRequest) {
  const { html, filename } = await req.json()

  // html-to-docx returns a Node.js Buffer in server environments
  const buffer = await htmlToDocx(html, null, {
    table: { row: { cantSplit: true } },
    footer: false,
    pageNumber: false,
    font: 'Calibri',
    fontSize: 22,          // 11pt (OOXML uses half-points)
    margins: { top: 1080, right: 1080, bottom: 1080, left: 1080 }, // ~0.75 in
  }) as unknown as Buffer

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}.docx"`,
    },
  })
}
