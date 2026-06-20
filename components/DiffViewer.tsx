'use client'

import { useMemo } from 'react'
import { computeDiffHtml } from '@/lib/diff'
import { Version } from '@/lib/supabase'

interface Props {
  currentVersion: Version
  previousVersion: Version | null
}

export default function DiffViewer({ currentVersion, previousVersion }: Props) {
  const diffHtml = useMemo(() => {
    if (!previousVersion) return null
    return computeDiffHtml(previousVersion.content, currentVersion.content)
  }, [currentVersion, previousVersion])

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="mb-4 flex items-center gap-3">
        <h3 className="font-semibold text-gray-800">
          v{currentVersion.version_number}
          {currentVersion.label ? ` — ${currentVersion.label}` : ''}
        </h3>
        {previousVersion && (
          <span className="text-sm text-gray-400">
            compared to v{previousVersion.version_number}
          </span>
        )}
      </div>

      {!previousVersion ? (
        <div
          className="prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: currentVersion.content }}
        />
      ) : (
        <>
          <div className="flex gap-4 text-xs mb-4">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-green-200 rounded inline-block" /> Added
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-red-200 rounded inline-block" /> Removed
            </span>
          </div>
          <div
            className="prose prose-sm max-w-none leading-relaxed"
            dangerouslySetInnerHTML={{ __html: diffHtml! }}
          />
        </>
      )}
    </div>
  )
}
