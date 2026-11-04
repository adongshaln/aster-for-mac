import { Check, ChevronDown, Copy } from 'lucide-react'
import { useState } from 'react'
import { cn, copyText, formatDuration } from '@/lib/utils'
import { ThinkingDots } from '@/components/ui/Loading'

export function ThinkingAccordion({
  text,
  live,
  durationMs,
  autoCollapse = true,
}: {
  text: string
  live: boolean
  durationMs?: number
  autoCollapse?: boolean
}) {
  const [manualOpen, setManualOpen] = useState<boolean | null>(null)
  const [copied, setCopied] = useState(false)
  const hasText = text.trim().length > 0
  const open = live || (manualOpen ?? !autoCollapse)

  if (!hasText && !live) return null

  const seconds = durationMs ? formatDuration(durationMs) : ''

  const handleCopy = async () => {
    const ok = await copyText(text)
    if (!ok) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="group/thinking mb-3 overflow-hidden rounded-[10px] border border-[var(--cds-border)] bg-[var(--cds-surface-1)]">
      <div className={cn('flex items-center gap-2 px-3 py-[7px]', live ? 'cursor-default' : 'hover:bg-[var(--cds-fill-ghost-hover)]')}>
        <button
          type="button"
          onClick={() => {
            if (live) return
            setManualOpen(current => !(current ?? !autoCollapse))
          }}
          className="flex min-w-0 flex-1 select-none items-center gap-2 text-left"
          aria-expanded={open}
        >
          {live ? (
            <ThinkingDots />
          ) : (
            <span className="size-[5px] shrink-0 rounded-full bg-clay/80" />
          )}
          <span className="text-[11.5px] font-medium text-[var(--cds-text-secondary)]">
            {live ? '正在思考' : seconds ? `已思考 ${seconds}` : '思考过程'}
          </span>
          {!live && (
            <ChevronDown
              size={12}
              className={cn('ml-auto shrink-0 text-[var(--cds-text-muted)] transition-transform duration-200', open && 'rotate-180')}
            />
          )}
        </button>
        {!live && hasText && (
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="flex h-5 shrink-0 items-center gap-1 rounded px-1 text-[10px] font-medium text-[var(--cds-text-muted)] opacity-0 transition-all hover:bg-[var(--cds-fill-ghost-hover)] hover:text-[var(--cds-text-primary)] group-hover/thinking:opacity-100"
            title="复制思考"
          >
            {copied ? <Check size={10} /> : <Copy size={10} />}
            {copied ? '已复制' : '复制'}
          </button>
        )}
      </div>

      <div
        className="grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(.19,1,.22,1)]"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-[var(--cds-border)] px-3.5 py-3">
            <div className="scroll-quiet max-h-[340px] overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11.5px] leading-[1.72] text-[var(--cds-text-secondary)] select-text">
              {text}
              {live && <span className="ml-0.5 inline-block h-3 w-[2px] animate-pulse bg-clay/70 align-middle" />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
