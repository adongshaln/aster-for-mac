import {
  Check,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileCode2,
  GitCompare,
  Maximize2,
  Minimize2,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ArtifactItem } from '@shared/types'
import { CodeBlock } from '@/components/CodeBlock'
import { Markdown } from '@/components/Markdown'
import { MermaidPreview } from '@/components/MermaidPreview'
import { buildLineDiff } from '@/lib/diff'
import { cn, copyText } from '@/lib/utils'
import { useAppStore } from '@/state/store'

export function ArtifactPane({
  artifact,
  onClose,
}: {
  artifact: ArtifactItem
  onClose: () => void
}) {
  const [mode, setMode] = useState<'preview' | 'code'>(
    artifact.kind === 'code' || artifact.kind === 'diff' ? 'code' : 'preview',
  )
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const diffRows = useMemo(() => {
    if (artifact.kind !== 'diff') return []
    return buildLineDiff(artifact.oldText ?? '', artifact.newText ?? artifact.content)
  }, [artifact])

  const iframeDoc = useMemo(() => {
    if (artifact.kind === 'svg') {
      return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:#fcfcfb;font-family:sans-serif}svg{max-width:94%;max-height:94%}</style></head><body>${artifact.content}</body></html>`
    }
    if (artifact.kind === 'html') {
      return artifact.content
    }
    return ''
  }, [artifact])

  return (
    <aside
      className={cn(
        'artifact-pane flex h-full min-w-0 shrink-0 flex-col border-l border-[var(--cds-border)] bg-[var(--cds-surface-1)] transition-[width] duration-200',
        expanded ? 'w-[62%]' : 'w-[440px]',
      )}
    >
      {/* Header */}
      <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-[var(--cds-border)] px-3.5">
        <div className="flex size-7 items-center justify-center rounded-[7px] bg-clay/10 text-clay">
          {artifact.kind === 'diff' ? <GitCompare size={14} /> : <FileCode2 size={14} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold">{artifact.title}</div>
          <div className="truncate font-mono text-[10px] text-[var(--cds-text-muted)]">
            {artifact.filename || artifact.kind.toUpperCase()}
          </div>
        </div>

        {artifact.kind !== 'code' && artifact.kind !== 'diff' && (
          <div className="flex items-center rounded-[7px] bg-[var(--cds-fill-ghost-hover)] p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setMode('preview')}
              className={cn(
                'flex items-center gap-1 rounded-[5px] px-2 py-0.5 font-medium transition-colors',
                mode === 'preview'
                  ? 'bg-[var(--cds-surface-2)] text-[var(--cds-text-primary)] shadow-sm'
                  : 'text-[var(--cds-text-muted)]',
              )}
            >
              <Eye size={11} />
              预览
            </button>
            <button
              type="button"
              onClick={() => setMode('code')}
              className={cn(
                'flex items-center gap-1 rounded-[5px] px-2 py-0.5 font-medium transition-colors',
                mode === 'code'
                  ? 'bg-[var(--cds-surface-2)] text-[var(--cds-text-primary)] shadow-sm'
                  : 'text-[var(--cds-text-muted)]',
              )}
            >
              <Code2 size={11} />
              源码
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={async () => {
            if (await copyText(artifact.content)) {
              setCopied(true)
              setTimeout(() => setCopied(false), 1600)
            }
          }}
          className="flex size-7 items-center justify-center rounded-lg text-[var(--cds-text-secondary)] hover:bg-[var(--cds-fill-ghost-hover)] hover:text-[var(--cds-text-primary)]"
          title="复制内容"
        >
          {copied ? <Check size={13} className="text-clay" /> : <Copy size={13} />}
        </button>

        <button type="button" onClick={() => void window.aster.app.exportArtifact(artifact).catch(error => useAppStore.getState().showToast(error instanceof Error ? error.message : String(error), 'error'))} className="flex size-7 shrink-0 items-center justify-center rounded-lg text-[var(--cds-text-secondary)] hover:bg-[var(--cds-fill-ghost-hover)]" title="另存为文件">
          <Download size={13} />
        </button>

        {artifact.filename && (
          <button
            type="button"
            onClick={() => void window.aster.app.showItemInFolder(artifact.filename!)}
            className="flex size-7 items-center justify-center rounded-lg text-[var(--cds-text-secondary)] hover:bg-[var(--cds-fill-ghost-hover)] hover:text-[var(--cds-text-primary)]"
            title="在 Finder 中显示"
          >
            <ExternalLink size={13} />
          </button>
        )}

        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="artifact-expand flex size-7 shrink-0 items-center justify-center rounded-lg text-[var(--cds-text-secondary)] hover:bg-[var(--cds-fill-ghost-hover)] hover:text-[var(--cds-text-primary)]"
          title={expanded ? '恢复宽度' : '加宽分栏'}
        >
          {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="flex size-7 items-center justify-center rounded-lg text-[var(--cds-text-secondary)] hover:bg-[var(--cds-fill-ghost-hover)] hover:text-[var(--cds-text-primary)]"
          title="关闭预览栏"
        >
          <X size={14} />
        </button>
      </header>

      {/* Body */}
      <div className="scroll-quiet min-h-0 flex-1 overflow-auto">
        {artifact.kind === 'diff' ? (
          <div className="font-mono text-[11.5px] leading-[1.6]">
            {diffRows.slice(0, 1200).map((row, idx) => (
              <div
                key={idx}
                className={cn(
                  'flex border-b border-[var(--cds-border)]/40 px-2',
                  row.type === 'add' && 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
                  row.type === 'del' && 'bg-red-500/12 text-red-700 dark:text-red-300',
                )}
              >
                <span className="w-9 shrink-0 select-none pr-2 text-right tabular-nums opacity-45">
                  {row.oldNum ?? ''}
                </span>
                <span className="w-9 shrink-0 select-none pr-2 text-right tabular-nums opacity-45">
                  {row.newNum ?? ''}
                </span>
                <span className="w-4 shrink-0 select-none opacity-65">
                  {row.type === 'add' ? '+' : row.type === 'del' ? '-' : ' '}
                </span>
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-all">{row.text}</span>
              </div>
            ))}
            {diffRows.length > 1200 && <p className="p-3 text-[var(--cds-text-muted)]">仅展示前 1200 行；另存为文件可查看完整差异。</p>}
          </div>
        ) : (artifact.kind === 'html' || artifact.kind === 'svg') && mode === 'preview' ? (
          <iframe
            title={artifact.title}
            srcDoc={iframeDoc}
            sandbox="allow-scripts"
            className="h-full w-full border-0 bg-white"
          />
        ) : artifact.kind === 'markdown' && mode === 'preview' ? (
          <div className="p-5"><Markdown content={artifact.content} /></div>
        ) : artifact.kind === 'mermaid' && mode === 'preview' ? (
          <MermaidPreview content={artifact.content} />
        ) : (
          <div className="p-3">
            <CodeBlock code={artifact.content} language={artifact.language || artifact.kind} />
          </div>
        )}
      </div>
    </aside>
  )
}
