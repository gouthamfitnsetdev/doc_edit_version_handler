'use client'

import { Version } from '@/lib/supabase'

interface Props {
  versions: Version[]
  activeVersionId: string
  onSelect: (version: Version) => void
  onSave: (label: string) => void
  saving: boolean
}

export default function VersionSidebar({ versions, activeVersionId, onSelect, onSave, saving }: Props) {
  function handleSave() {
    const label = prompt('Version label (optional):') ?? ''
    onSave(label)
  }

  return (
    <div className="flex flex-col h-full bg-white border-l w-64 shrink-0">
      <div className="p-4 border-b">
        <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Versions</h2>
        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-3 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : '+ Save Version'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {versions.length === 0 && (
          <p className="text-gray-400 text-sm p-4">No versions yet.</p>
        )}
        {[...versions].reverse().map(v => (
          <button
            key={v.id}
            onClick={() => onSelect(v)}
            className={`w-full text-left p-4 border-b hover:bg-gray-50 transition-colors
              ${v.id === activeVersionId ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-800">
                v{v.version_number}
              </span>
              {v.id === activeVersionId && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">active</span>
              )}
            </div>
            {v.label && (
              <p className="text-xs text-gray-500 mt-1 truncate">{v.label}</p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              {new Date(v.created_at).toLocaleString()}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}
