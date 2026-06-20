function htmlToText(html: string): string {
  const el = document.createElement('div')
  el.innerHTML = html
  return el.innerText
}

export async function downloadAsDocx(html: string, filename: string) {
  const res = await fetch('/api/export/docx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, filename }),
  })
  if (!res.ok) throw new Error('DOCX export failed')
  const blob = await res.blob()
  triggerDownload(blob, `${filename}.docx`)
}

export function downloadAsTxt(html: string, filename: string) {
  const text = htmlToText(html)
  const blob = new Blob([text], { type: 'text/plain' })
  triggerDownload(blob, `${filename}.txt`)
}

export async function downloadAsPdf(html: string, filename: string) {
  const html2pdf = (await import('html2pdf.js')).default
  const element = document.createElement('div')
  element.innerHTML = html
  element.style.padding = '20px'
  element.style.fontFamily = 'Arial, sans-serif'
  document.body.appendChild(element)

  await html2pdf()
    .set({
      margin: 10,
      filename: `${filename}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    })
    .from(element)
    .save()

  document.body.removeChild(element)
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
