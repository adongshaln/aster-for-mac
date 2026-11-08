import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleDot,
  Copy,
  CornerDownRight,
  ExternalLink,
  FileCode2,
  Globe,
  ImageDown,
  Loader2,
  Quote,
  RefreshCw,
  Square,
} from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import type { Attachment, ChatCitation, ChatMessage, TodoItem, ToolActivity } from '@shared/types'
import { Markdown } from '@/components/Markdown'
import { ThinkingAccordion } from '@/components/ThinkingAccordion'
import { ThinkingDots } from '@/components/ui/Loading'
import { useAppStore } from '@/state/store'
import { estimateMessageCost, formatCurrencyCost } from '@/lib/usage'
import { cn, copyText, formatClock, formatDuration } from '@/lib/utils'

export const MessageItem = memo(function MessageItem({
  message,
  isLastAssistant,
  streamingHere,
}: {
  message: ChatMessage
  isLastAssistant: boolean
  streamingHere: boolean
}) {
  if (message.role === 'user') return <UserMessage message={message} />
  return (
    <AssistantMessage
      message={message}
      isLastAssistant={isLastAssistant}
      streamingHere={streamingHere}
    />
  )
})

function UserMessage({ message }: { message: ChatMessage }) {
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const long = message.content.length > 700
  const showCollapsed = long && !expanded

  return (
    <div className="group/user flex flex-col items-end gap-1.5 py-2">
      {message.attachments.length > 0 && <MessageImages attachments={message.attachments} align="end" />}
      <div className="relative max-w-[82%]">
        <div className="rounded-bubble border border-[var(--cds-border)] bg-[var(--cds-bg-user-message)] px-4 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <div
            className={cn(
              'relative overflow-hidden whitespace-pre-wrap break-words text-[14px] leading-[1.65] text-[var(--cds-text-primary)] select-text',
              showCollapsed && 'max-h-[260px]',
            )}
          >
            {message.content}
            {showCollapsed && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[var(--cds-bg-user-message)] to-transparent" />
            )}
          </div>
          {long && (
            <button
              type="button"
              onClick={() => setExpanded(value => !value)}
              className="mt-1 flex items-center gap-0.5 text-[10.5px] font-medium text-clay hover:underline"
            >
              {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              {expanded ? '收起' : '展开全文'}
            </button>
          )}
        </div>
      </div>
      <div className="flex h-4 items-center gap-1.5 pr-1 text-[10px] text-[var(--cds-text-muted)] opacity-0 transition-opacity group-hover/user:opacity-100">
        <span>{formatClock(message.createdAt)}</span>
        <button
          type="button"
          onClick={async () => {
            if (await copyText(message.content)) {
              setCopied(true)
              setTimeout(() => setCopied(false), 1600)
            }
          }}
          className="rounded p-0.5 transition-colors hover:bg-[var(--cds-fill-ghost-hover)] hover:text-[var(--cds-text-primary)]"
          title="复制"
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
        </button>
      </div>
    </div>
  )
}

function AssistantMessage({
  message,
  isLastAssistant,
  streamingHere,
}: {
  message: ChatMessage
  isLastAssistant: boolean
  streamingHere: boolean
}) {
  const regenerate = useAppStore(state => state.regenerateLast)
  const continueLast = useAppStore(state => state.continueLast)
  const setComposerQuote = useAppStore(state => state.setComposerQuote)
  const setActiveArtifact = useAppStore(state => state.setActiveArtifact)
  const openImageExport = useAppStore(state => state.openImageExport)
  const settings = useAppStore(state => state.config?.settings)
  const [copied, setCopied] = useState(false)
  const [usageOpen, setUsageOpen] = useState(false)

  const streaming = message.status === 'streaming'
  const liveReasoning = streaming && !message.content
  const canContinue = isLastAssistant && !streaming && message.status !== 'complete'
  const canRegenerate = isLastAssistant && !streaming && !streamingHere
  const currency = settings?.billingCurrency ?? 'CNY'

  const { usageLabel, costText } = useMemo(() => {
    if (!message.usage) return { usageLabel: '', costText: '' }
    const total = message.usage.totalTokens || (message.usage.inputTokens + message.usage.outputTokens)
    const label = total ? `${total.toLocaleString()} tok` : ''
    if (!total || currency === 'OFF') return { usageLabel: label, costText: '' }
    const cost = estimateMessageCost(
      message.model,
      message.usage.inputTokens,
      message.usage.cachedTokens,
      message.usage.outputTokens,
      message.createdAt,
    )
    return {
      usageLabel: label,
      costText: formatCurrencyCost(cost.cny, cost.usd, currency),
    }
  }, [message.usage, message.model, message.createdAt, currency])

  const toolActivities = message.toolActivities ?? []
  const todos = message.todos ?? []
  const artifacts = message.artifacts ?? []
  const citations = message.citations ?? []

  return (
    <div className="group/assistant flex flex-col py-3">
      {message.attachments.length > 0 && (
        <div className="mb-2">
          <MessageImages attachments={message.attachments} align="start" />
          {!message.content && !message.reasoning && (
            <div className="mt-1.5 flex items-center gap-1 text-[9.5px] text-[var(--cds-text-muted)]">
              <span className="max-w-[200px] truncate font-mono opacity-70">{message.model || 'Aster'}</span>
              <span className="opacity-40">·</span>
              <span>生成图片</span>
            </div>
          )}
        </div>
      )}

      {message.reasoning && (
        <div className="group/thinking">
          <ThinkingAccordion
            text={message.reasoning}
            live={liveReasoning}
            durationMs={message.reasoningDurationMs}
            autoCollapse={settings?.autoCollapseThinking ?? true}
          />
        </div>
      )}

      {/* dsh-claude-style Process Column / Borderless Ink Tool Row */}
      {toolActivities.length > 0 && <ProcessColumnGroup activities={toolActivities} />}

      {/* DeepSeek Harness Live Todo Checklist */}
      {todos.length > 0 && <TodoChecklistCard todos={todos} />}

      {message.content ? (
        <Markdown content={message.content} />
      ) : streaming && toolActivities.every(a => a.status !== 'running') ? (
        <div className="flex items-center gap-2 py-1.5 text-[12px] text-[var(--cds-text-muted)]">
          <ThinkingDots />
          <span className="cds-shimmer-text font-medium">正在组织回答…</span>
        </div>
      ) : message.status === 'stopped' ? (
        <div className="flex items-center gap-2 py-1.5 text-[12px] text-[var(--cds-text-muted)]">
          <Square size={9} />
          <span>已停止生成</span>
        </div>
      ) : null}

      {/* Artifact Split Pane Trigger Cards */}
      {artifacts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {artifacts.map(art => (
            <button
              key={art.id}
              type="button"
              onClick={() => setActiveArtifact(art)}
              className="flex items-center gap-2.5 rounded-[12px] border border-[var(--cds-border)] bg-[var(--cds-surface-2)] px-3 py-2 text-left shadow-sm transition-all hover:border-clay/50 hover:shadow-md active:scale-[0.98]"
            >
              <div className="flex size-7 items-center justify-center rounded-[7px] bg-clay/10 text-clay">
                <FileCode2 size={14} />
              </div>
              <div className="min-w-0">
                <div className="max-w-[220px] truncate text-[12px] font-semibold text-[var(--cds-text-primary)]">
                  {art.title}
                </div>
                <div className="font-mono text-[10px] text-[var(--cds-text-muted)]">
                  点击在右侧分栏打开预览 · {art.kind.toUpperCase()}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Two-Line Paper Citation Cards */}
      {citations.length > 0 && <CitationRail citations={citations} />}

      {message.status === 'error' && (
        <div className="mt-1 flex items-center gap-2 py-1 text-[12px] text-red-500">
          <AlertCircle size={13} className="shrink-0" />
          <span className="break-words select-text">{message.error || '请求失败'}</span>
        </div>
      )}

      {message.status === 'stopped' && message.content && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-[var(--cds-text-muted)]">
          <Square size={8} />
          已停止，可继续生成
        </div>
      )}

      {streaming && message.content && (
        <span className="mt-1 inline-flex h-3 items-center">
          <span className="inline-block h-3 w-[2px] animate-pulse rounded-full bg-clay/65" />
        </span>
      )}

      {!streaming && (message.content || message.reasoning || message.status === 'error') && (
        <div className="mt-2 flex min-h-[22px] items-center gap-1 text-[10.5px] text-[var(--cds-text-muted)]">
          <span className="max-w-[180px] truncate font-mono text-[9.5px] opacity-70">{message.model || 'Aster'}</span>
          {message.durationMs ? (
            <>
              <span className="opacity-35">·</span>
              <span>{formatDuration(message.durationMs)}</span>
            </>
          ) : null}
          {settings?.showTokenUsage && usageLabel ? (
            <button
              type="button"
              onClick={() => setUsageOpen(value => !value)}
              className="ml-0.5 rounded px-1 py-0.5 tabular-nums transition-colors hover:bg-[var(--cds-fill-ghost-hover)] hover:text-[var(--cds-text-primary)]"
            >
              {usageLabel}
              {costText && <span className="ml-1.5 font-medium text-clay">{costText}</span>}
            </button>
          ) : null}

          <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover/assistant:opacity-100 focus-within:opacity-100">
            {message.content && (
              <button
                type="button"
                onClick={() => {
                  const snippet = message.content.replace(/\s+/g, ' ').trim().slice(0, 110)
                  setComposerQuote(snippet + (message.content.length > 110 ? '…' : ''))
                }}
                className="flex h-6 items-center gap-1 rounded px-1.5 transition-colors hover:bg-[var(--cds-fill-ghost-hover)] hover:text-[var(--cds-text-primary)]"
                title="引用追问"
              >
                <Quote size={11} />
                引用追问
              </button>
            )}
            {canRegenerate && (
              <button
                type="button"
                onClick={() => void regenerate()}
                className="flex h-6 items-center gap-1 rounded px-1.5 transition-colors hover:bg-[var(--cds-fill-ghost-hover)] hover:text-[var(--cds-text-primary)]"
                title="重新生成"
              >
                <RefreshCw size={11} />
                重试
              </button>
            )}
            {canContinue && (
              <button
                type="button"
                onClick={() => void continueLast()}
                className="flex h-6 items-center gap-1 rounded px-1.5 transition-colors hover:bg-[var(--cds-fill-ghost-hover)] hover:text-[var(--cds-text-primary)]"
                title="继续生成"
              >
                <CornerDownRight size={11} />
                继续
              </button>
            )}
            {message.content && (
              <button
                type="button"
                onClick={() => openImageExport(message.id)}
                className="flex h-6 items-center gap-1 rounded px-1.5 transition-colors hover:bg-[var(--cds-fill-ghost-hover)] hover:text-[var(--cds-text-primary)]"
                title="导出此轮为图片"
              >
                <ImageDown size={11} />
                导出
              </button>
            )}
            {message.content && (
              <button
                type="button"
                onClick={async () => {
                  if (await copyText(message.content)) {
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1600)
                  }
                }}
                className="flex h-6 items-center gap-1 rounded px-1.5 transition-colors hover:bg-[var(--cds-fill-ghost-hover)] hover:text-[var(--cds-text-primary)]"
                title="复制回答"
              >
                {copied ? <Check size={11} /> : <Copy size={11} />}
                {copied ? '已复制' : '复制'}
              </button>
            )}
          </div>
        </div>
      )}

      {usageOpen && message.usage && (
        <div className="settings-section-enter mt-1.5 grid grid-cols-3 gap-2 rounded-lg border border-[var(--cds-border)] bg-[var(--cds-surface-1)] px-3 py-2 text-[10px] text-[var(--cds-text-secondary)]">
          <UsageCell label="输入" value={message.usage.inputTokens} />
          <UsageCell label="输出" value={message.usage.outputTokens} />
          <UsageCell label="缓存命中" value={message.usage.cachedTokens} />
          <UsageCell label="推理" value={message.usage.reasoningTokens} />
          <UsageCell label="首字延迟" value={message.usage.timeToFirstTokenMs ?? 0} suffix="ms" />
          <UsageCell label="总耗时" value={message.usage.durationMs ?? message.durationMs ?? 0} suffix="ms" />
        </div>
      )}
    </div>
  )
}

/**
 * `dsh-claude-style` Process Column (`features/process-column/process-column.css`):
 * Featherlight borderless summary line above an expandable 8px-radius card with 36px rows and 0.5px dividers.
 */
function ProcessColumnGroup({ activities }: { activities: ToolActivity[] }) {
  const [expanded, setExpanded] = useState(false)
  const [openRowId, setOpenRowId] = useState<string | null>(null)
  const latest = activities[activities.length - 1]
  const running = activities.some(a => a.status === 'running' || a.status === 'pending_approval')
  const failed = !running && activities.some(a => a.status === 'failed')

  const headerLabel = running
    ? latest.label
    : activities.length === 1
      ? latest.label
      : `已完成 ${activities.length} 项工具操作`

  return (
    <div className="mb-2.5 select-none">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1.5 rounded-[7px] py-1 pr-2 text-left text-[12px] font-medium text-[var(--cds-text-secondary)] transition-colors hover:text-[var(--cds-text-primary)]"
      >
        {running ? (
          <Loader2 size={13} className=" shrink-0 animate-spin text-clay" />
        ) : failed ? (
          <AlertCircle size={13} className="shrink-0 text-red-500" />
        ) : (
          <CheckCircle2 size={13} className="shrink-0 text-emerald-600/85 dark:text-emerald-400/85" />
        )}
        <span className={cn('truncate', running && 'cds-shimmer-text')}>{headerLabel}</span>
        <ChevronRight
          size={13}
          className={cn('shrink-0 opacity-65 transition-transform duration-150', expanded && 'rotate-90')}
        />
      </button>

      {expanded && (
        <div className="settings-section-enter mt-1.5 overflow-hidden rounded-[8px] border border-[var(--cds-border)] bg-[var(--cds-surface-2)]">
          {activities.map((act, idx) => {
            const isOpen = openRowId === act.id
            const hasDetails = Boolean(act.output || act.input)
            return (
              <div
                key={act.id}
                className={cn(idx > 0 && 'border-t border-[var(--cds-border)]/60')}
              >
                <button
                  type="button"
                  disabled={!hasDetails}
                  onClick={() => setOpenRowId(isOpen ? null : act.id)}
                  className="flex h-[34px] w-full items-center gap-2 px-3 text-left text-[11.5px] text-[var(--cds-text-secondary)] transition-colors hover:bg-[var(--cds-fill-ghost-hover)] disabled:cursor-default"
                >
                  <span className="font-mono text-[10.5px] text-clay">{act.name}</span>
                  <span className="opacity-40">·</span>
                  <span className="min-w-0 flex-1 truncate">{act.label}</span>
                  {act.durationMs != null && (
                    <span className="font-mono text-[10px] tabular-nums text-[var(--cds-text-muted)]">
                      {act.durationMs}ms
                    </span>
                  )}
                  {hasDetails && (
                    <ChevronRight
                      size={12}
                      className={cn('shrink-0 opacity-55 transition-transform', isOpen && 'rotate-90')}
                    />
                  )}
                </button>
                {isOpen && hasDetails && (
                  <div className="border-t border-[var(--cds-border)]/40 bg-[var(--cds-surface-1)] px-3 py-2 font-mono text-[10.5px] leading-relaxed text-[var(--cds-text-secondary)]">
                    {act.output ? (
                      <pre className="scroll-quiet max-h-[180px] overflow-auto whitespace-pre-wrap break-all select-text">
                        {act.output}
                      </pre>
                    ) : (
                      <pre className="scroll-quiet max-h-[140px] overflow-auto whitespace-pre-wrap break-all select-text">
                        {JSON.stringify(act.input, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TodoChecklistCard({ todos }: { todos: TodoItem[] }) {
  const done = todos.filter(t => t.status === 'completed').length
  return (
    <div className="mb-3 rounded-[10px] border border-[var(--cds-border)] bg-[var(--cds-surface-2)] px-3.5 py-2.5">
      <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-[var(--cds-text-secondary)]">
        <span>任务进度 · Todo Plan</span>
        <span className="font-mono tabular-nums text-clay">
          {done}/{todos.length}
        </span>
      </div>
      <div className="space-y-1">
        {todos.map((todo, idx) => (
          <div key={idx} className="flex items-center gap-2 text-[11.5px]">
            {todo.status === 'completed' ? (
              <CheckCircle2 size={12.5} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : todo.status === 'in_progress' ? (
              <CircleDot size={12.5} className="shrink-0 animate-pulse text-clay" />
            ) : (
              <span className="size-3 shrink-0 rounded-full border border-[var(--cds-border-strong)]" />
            )}
            <span
              className={cn(
                'truncate',
                todo.status === 'completed'
                  ? 'text-[var(--cds-text-muted)] line-through'
                  : todo.status === 'in_progress'
                    ? 'font-medium text-[var(--cds-text-primary)]'
                    : 'text-[var(--cds-text-secondary)]',
              )}
            >
              {todo.content}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CitationRail({ citations }: { citations: ChatCitation[] }) {
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-[var(--cds-text-muted)]">
        <Globe size={11.5} />
        <span>参考来源 · {citations.length}</span>
      </div>
      <div className="scroll-invisible flex items-center gap-2 overflow-x-auto pb-1">
        {citations.map((cite, idx) => {
          let domain = cite.siteName || ''
          if (!domain) {
            try {
              domain = new URL(cite.url).hostname.replace(/^www\./, '')
            } catch {
              domain = ''
            }
          }
          return (
            <button
              key={cite.url}
              type="button"
              onClick={() => void window.aster.app.openExternal(cite.url)}
              className="flex max-w-[230px] shrink-0 items-center gap-2 rounded-[10px] border border-[var(--cds-border)] bg-[var(--cds-surface-2)] px-2.5 py-1.5 text-left transition-all hover:border-[var(--cds-border-strong)] active:scale-[0.97]"
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-clay/12 text-[10px] font-bold text-clay">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-medium text-[var(--cds-text-primary)]">
                  {cite.title}
                </div>
                {domain && (
                  <div className="truncate text-[9.5px] text-[var(--cds-text-muted)]">{domain}</div>
                )}
              </div>
              <ExternalLink size={11} className="shrink-0 text-[var(--cds-text-muted)]" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function UsageCell({ label, value, suffix = '' }: { label: string; value: number; suffix?: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wide opacity-55">{label}</div>
      <div className="mt-0.5 font-mono text-[10.5px] tabular-nums text-[var(--cds-text-primary)]">
        {value ? `${value.toLocaleString()}${suffix}` : '—'}
      </div>
    </div>
  )
}

export function MessageImages({ attachments, align = 'start' }: { attachments: Attachment[]; align?: 'start' | 'end' }) {
  if (!attachments.length) return null
  const single = attachments.length === 1
  return (
    <div className={cn('flex flex-wrap gap-1.5', align === 'end' ? 'justify-end' : 'justify-start')}>
      {attachments.map(attachment => (
        <div
          key={attachment.id}
          className={cn(
            'overflow-hidden rounded-[10px] border border-[var(--cds-border)] bg-[var(--cds-surface-1)]',
            single ? 'max-w-[300px]' : 'size-[124px]',
          )}
        >
          <img
            src={attachment.url}
            alt={attachment.name}
            className={cn('object-cover', single ? 'max-h-[260px] w-auto' : 'size-full')}
            draggable={false}
          />
        </div>
      ))}
    </div>
  )
}
