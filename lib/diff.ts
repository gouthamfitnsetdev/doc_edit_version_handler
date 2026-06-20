import * as Diff from 'diff'

function htmlToText(html: string): string {
  if (typeof document !== 'undefined') {
    const el = document.createElement('div')
    el.innerHTML = html
    return el.innerText
  }
  return html.replace(/<[^>]+>/g, '')
}

export function computeDiffHtml(oldHtml: string, newHtml: string): string {
  const oldText = htmlToText(oldHtml)
  const newText = htmlToText(newHtml)
  const changes = Diff.diffWords(oldText, newText)

  let result = ''
  for (const part of changes) {
    if (part.added) {
      result += `<mark class="bg-green-200 text-green-900">${part.value}</mark>`
    } else if (part.removed) {
      result += `<del class="bg-red-200 text-red-900 line-through">${part.value}</del>`
    } else {
      result += part.value
    }
  }

  return `<div class="whitespace-pre-wrap">${result}</div>`
}
