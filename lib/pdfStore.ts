const store = new Map<string, Uint8Array>()

export function storePdfBytes(docId: string, bytes: Uint8Array): void {
  store.set(docId, bytes)
}

export function getPdfBytes(docId: string): Uint8Array | null {
  return store.get(docId) ?? null
}
