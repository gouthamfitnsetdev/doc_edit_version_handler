'use client'

import { useState } from 'react'
import { Version } from '@/lib/supabase'

interface Props {
  versions: Version[]
  activeVersionId: string
  onSelect: (version: Version) => void
  onSave: (label: string) => void
  saving: boolean
}

export default function VersionSidebar({ versions, activeVersionId, onSelect, onSave, saving }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false)

  function handleSave() {
    const label = prompt('Version label (optional):') ?? ''
    onSave(label)
  }

  const activeVersion = versions.find(v => v.id === activeVersionId)

  const VersionList = () => (
    <div className="flex-1 overflow-y-auto">
      {versions.length === 0 && (
        <p className="text-[#9CA3AF] text-sm p-4">No versions yet.</p>
      )}
      {[...versions].reverse().map(v => (
        <button
          key={v.id}
          onClick={() => { onSelect(v); setSheetOpen(false) }}
          className={`w-full text-left p-4 border-b border-[#F0EDE6] hover:bg-[#F8F5EF] transition-colors
            ${v.id === activeVersionId ? 'bg-[#F0EEFF] border-l-2 border-l-[#5B4FE9]' : ''}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#0C0C0C]">v{v.version_number}</span>
            {v.id === activeVersionId && (
              <span className="text-[10px] bg-[#EDE9FF] text-[#5B4FE9] px-2 py-0.5 rounded-full font-medium">active</span>
            )}
          </div>
          {v.label && <p className="text-xs text-[#6B7280] mt-0.5 truncate">{v.label}</p>}
          <p className="text-xs text-[#C4BFB8] mt-0.5">
            {new Date(v.created_at).toLocaleString()}
          </p>
        </button>
      ))}
    </div>
  )

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex flex-col h-full bg-white border-l border-[#E8E4DC] w-60 shrink-0">
        <div className="p-4 border-b border-[#E8E4DC]">
          <p className="text-[10px] font-semibold text-[#9CA3AF] tracking-widest uppercase mb-3">Versions</p>
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-[#5B4FE9] hover:bg-[#4A3FD4] disabled:bg-[#C4BFFF] text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
          >
            {saving ? 'Saving…' : '+ Save Version'}
          </button>
        </div>
        <VersionList />
      </aside>

      {/* ── Mobile bottom sheet ── */}
      <div className="md:hidden">
        {/* Bottom bar — always visible */}
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#E8E4DC] flex items-center gap-2 px-4 py-2.5">
          <button
            onClick={() => setSheetOpen(o => !o)}
            className="flex items-center gap-1.5 text-sm text-[#6B7280] hover:text-[#0C0C0C] transition-colors"
          >
            <span className="text-[10px] font-semibold tracking-widest uppercase">Versions</span>
            <span className="text-[10px] bg-[#F0EDE6] text-[#6B7280] px-1.5 py-0.5 rounded-full">
              {versions.length}
            </span>
            <span className="text-xs">{sheetOpen ? '▼' : '▲'}</span>
          </button>
          {activeVersion && (
            <span className="text-xs text-[#9CA3AF] truncate flex-1">
              {activeVersion.label ?? `v${activeVersion.version_number}`}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#5B4FE9] hover:bg-[#4A3FD4] disabled:bg-[#C4BFFF] text-white text-xs font-medium py-1.5 px-3 rounded-lg transition-colors shrink-0"
          >
            {saving ? 'Saving…' : '+ Save'}
          </button>
        </div>

        {/* Sheet panel */}
        {sheetOpen && (
          <>
            <div
              className="fixed inset-0 z-30 bg-black/20"
              onClick={() => setSheetOpen(false)}
            />
            <div className="fixed bottom-12 left-0 right-0 z-40 bg-white border-t border-[#E8E4DC] max-h-64 flex flex-col rounded-t-2xl shadow-xl">
              <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-[#F0EDE6]">
                <p className="text-[10px] font-semibold text-[#9CA3AF] tracking-widest uppercase">Version history</p>
                <button onClick={() => setSheetOpen(false)} className="text-[#9CA3AF] text-lg leading-none">×</button>
              </div>
              <VersionList />
            </div>
          </>
        )}

        {/* Spacer so PDF canvas isn't hidden behind bottom bar */}
        <div className="h-12" />
      </div>
    </>
  )
}
