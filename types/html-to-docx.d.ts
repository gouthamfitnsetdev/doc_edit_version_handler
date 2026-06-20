declare module 'html-to-docx' {
  function htmlToDocx(html: string, headerHtml: null | string, options?: Record<string, unknown>): Promise<Blob>
  export default htmlToDocx
}
