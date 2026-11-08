import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, Download, ImageDown, Loader2, X } from 'lucide-react'
import { toPng } from 'html-to-image'
import type { Attachment, ChatMessage } from '@shared/types'
import { Modal } from '@/components/ui/Modal'
import { ExportCard, type ExportOptions } from '@/components/ExportCard'
import { useAppStore, activeConversation } from '@/state/store'
import { plainPreview } from '@/lib/markdown-clean'
import {
  EXPORT_CARD_WIDTH,
  EXPORT_TEMPLATES,
  MAX_EXPORT_CSS_HEIGHT,
  buildExportRounds,
  exportImageFilename,
  exportPixelRatio,
  formatExportTime,
  roundIdForMessage,
  templateById,
  type ExportTemplateId,
} from '@/lib/export-image'
import '@/styles/export-image.css'

const attachmentCache = new Map<string, string>()

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.readAsDataURL(blob)
  })
}

async function loadAttachment(url: string): Promise<string | null> {
  const cached = attachmentCache.get(url)
  if (cached) return cached
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const data = await blobToDataUrl(await response.blob())
    if (!data.startsWith('data:image/')) return null
    attachmentCache.set(url, data)
    return data
  } catch {
    return null
  }
}

function allAttachments(rounds: ReturnType<typeof buildExportRounds>): Attachment[] {
  return rounds.flatMap(round => [
    ...(round.user?.attachments ?? []),
    ...round.assistants.flatMap(message => message.attachments),
  ])
}

function allMessages(rounds: ReturnType<typeof buildExportRounds>): ChatMessage[] {
  return rounds.flatMap(round => [...(round.user ? [round.user] : []), ...round.assistants])
}

function OptionPill({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-6 items-center gap-1 rounded-full border px-2.5 text-[10.5px] font-medium transition-colors ${
        active
          ? 'border-clay/40 bg-clay/10 text-clay'
          : 'border-[var(--cds-border)] text-[var(--cds-text-muted)] hover:border-[var(--cds-border-strong)] hover:text-[var(--cds-text-primary)]'
      } disabled:cursor-default disabled:opacity-40`}
    >
      {active && <Check size={9} />}
      {children}
    </button>
  )
}

export function ImageExportDialog() {
  const open = useAppStore(state => state.imageExportOpen)
  const messageId = useAppStore(state => state.imageExportMessageId)
  const close = useAppStore(state => state.closeImageExport)
  const conversation = useAppStore(activeConversation)
  const showToast = useAppStore(state => state.showToast)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [templateId, setTemplateId] = useState<ExportTemplateId>('paper')
  const [options, setOptions] = useState<ExportOptions>({
    includeReasoning: false,
    includeCitations: true,
    includeAttachments: true,
  })
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({})
  const [exportedAt, setExportedAt] = useState(Date.now())
  const [cardHeight, setCardHeight] = useState(0)
  const [previewScale, setPreviewScale] = useState(0.55)
  const [exporting, setExporting] = useState<'save' | 'copy' | null>(null)
  const [copied, setCopied] = useState(false)

  const exportRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)

  const rounds = useMemo(
    () => (conversation ? buildExportRounds(conversation.messages) : []),
    [conversation],
  )
  const selectedRounds = useMemo(
    () => rounds.filter(round => selected.has(round.id)),
    [rounds, selected],
  )
  const template = templateById(templateId)
  const messages = useMemo(() => allMessages(selectedRounds), [selectedRounds])
  const attachments = useMemo(() => allAttachments(selectedRounds), [selectedRounds])
  const hasReasoning = messages.some(message => message.reasoning.trim())
  const hasCitations = messages.some(message => (message.citations ?? []).length > 0)
  const hasAttachments = attachments.length > 0
  const ratio = exportPixelRatio(cardHeight)
  const pixelWidth = Math.round(EXPORT_CARD_WIDTH * ratio)
  const pixelHeight = cardHeight ? Math.round(cardHeight * ratio) : 0
  const tooLong = cardHeight > MAX_EXPORT_CSS_HEIGHT
  const canExport = Boolean(selectedRounds.length && cardHeight && !tooLong && !exporting)

  useEffect(() => {
    if (!open) return
    const target = roundIdForMessage(rounds, messageId)
    const initial = target ?? rounds.at(-1)?.id
    setSelected(new Set(initial ? [initial] : []))
    setTemplateId('paper')
    setOptions({ includeReasoning: false, includeCitations: true, includeAttachments: true })
    setAttachmentUrls({})
    setExportedAt(Date.now())
    setCopied(false)
    // Only reset when the dialog opens or its target changes; adding a round
    // while the dialog is open must not discard the user's selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, messageId, conversation?.id])

  useEffect(() => {
    if (!open || !options.includeAttachments || !selectedRounds.length) return
    let cancelled = false
    const pending = attachments.filter(attachment => !attachmentUrls[attachment.id])
    if (!pending.length) return
    void Promise.all(
      pending.map(async attachment => [attachment.id, await loadAttachment(attachment.url)] as const),
    ).then(entries => {
      if (cancelled) return
      setAttachmentUrls(previous => {
        const next = { ...previous }
        for (const [id, dataUrl] of entries) if (dataUrl) next[id] = dataUrl
        return next
      })
    })
    return () => { cancelled = true }
  }, [open, options.includeAttachments, selectedRounds, attachments, attachmentUrls])

  useLayoutEffect(() => {
    if (!open || !selectedRounds.length) {
      setCardHeight(0)
      return
    }
    const element = exportRef.current
    if (!element) return
    const measure = () => setCardHeight(element.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [open, selectedRounds, templateId, options, attachmentUrls])

  useLayoutEffect(() => {
    if (!open) return
    const element = previewRef.current
    if (!element) return
    const update = () => {
      const width = element.clientWidth - 40
      setPreviewScale(Math.max(0.3, Math.min(0.6, width / EXPORT_CARD_WIDTH)))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [open])

  const toggleRound = (id: string) => {
    setSelected(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const buildPng = async (): Promise<string> => {
    const node = exportRef.current
    if (!node) throw new Error('预览尚未准备好')
    if (!selectedRounds.length) throw new Error('请至少选择一轮对话')
    if (cardHeight > MAX_EXPORT_CSS_HEIGHT) throw new Error('内容过长，请减少轮次后再导出')
    await document.fonts.ready
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    return toPng(node, {
      pixelRatio: ratio,
      backgroundColor: template.bg,
      cacheBust: true,
      skipFonts: true,
    })
  }

  const save = async () => {
    if (!conversation || !canExport) return
    setExporting('save')
    try {
      const dataUrl = await buildPng()
      const file = await window.aster.app.exportImage({
        dataUrl,
        filename: exportImageFilename(conversation.title, selectedRounds.length),
      })
      if (file) {
        showToast('对话图片已保存', 'success')
        close()
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导出图片失败', 'error')
    } finally {
      setExporting(null)
    }
  }

  const copy = async () => {
    if (!canExport) return
    setExporting('copy')
    try {
      const dataUrl = await buildPng()
      const blob = await (await fetch(dataUrl)).blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setCopied(true)
      showToast('对话图片已复制到剪贴板', 'success')
      window.setTimeout(() => setCopied(false), 1800)
    } catch (error) {
      showToast(error instanceof Error ? error.message : '复制图片失败', 'error')
    } finally {
      setExporting(null)
    }
  }

  const previewWidth = EXPORT_CARD_WIDTH * previewScale
  const previewHeight = cardHeight * previewScale

  return (
    <Modal open={open} onClose={close} width={1120} className="outline-none" label="导出对话为图片">
      <div className="flex h-[min(790px,calc(100vh-48px))] flex-col overflow-hidden rounded-[20px] border border-[var(--cds-border)] bg-[var(--cds-surface-1)] shadow-popover">
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--cds-border)] px-5 py-3.5">
          <div className="flex size-8 items-center justify-center rounded-[9px] bg-clay/10 text-clay">
            <ImageDown size={16} />
          </div>
          <div className="min-w-0">
            <h1 className="text-[14.5px] font-semibold tracking-[-0.01em]">导出对话为图片</h1>
            <p className="mt-0.5 text-[10.5px] text-[var(--cds-text-muted)]">
              选择轮次与模板 · 本地排版，不经过模型
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="ml-auto flex size-7 items-center justify-center rounded-lg text-[var(--cds-text-muted)] transition-colors hover:bg-[var(--cds-fill-ghost-hover)] hover:text-[var(--cds-text-primary)]"
            title="关闭"
          >
            <X size={14} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="flex w-[300px] shrink-0 flex-col border-r border-[var(--cds-border)] bg-[var(--cds-surface-0)] p-3.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--cds-text-muted)]">
                选择轮次
              </span>
              <span className="font-mono text-[10px] tabular-nums text-[var(--cds-text-muted)]">
                {selectedRounds.length}/{rounds.length}
              </span>
            </div>
            <div className="mt-2 flex gap-1.5 px-1">
              <button
                type="button"
                onClick={() => setSelected(new Set(rounds.map(round => round.id)))}
                className="h-6 rounded-md px-1.5 text-[10.5px] font-medium text-[var(--cds-text-muted)] transition-colors hover:bg-[var(--cds-fill-ghost-hover)] hover:text-[var(--cds-text-primary)]"
              >
                全选
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="h-6 rounded-md px-1.5 text-[10.5px] font-medium text-[var(--cds-text-muted)] transition-colors hover:bg-[var(--cds-fill-ghost-hover)] hover:text-[var(--cds-text-primary)]"
              >
                清空
              </button>
            </div>

            <div className="scroll-quiet mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
              {rounds.length === 0 && (
                <div className="rounded-xl border border-dashed border-[var(--cds-border)] px-3 py-6 text-center text-[11px] leading-relaxed text-[var(--cds-text-muted)]">
                  当前对话还没有可导出的内容
                </div>
              )}
              {rounds.map(round => {
                const checked = selected.has(round.id)
                const preview = plainPreview(
                  round.user?.content || round.assistants.map(message => message.content).join(' '),
                  90,
                )
                return (
                  <button
                    key={round.id}
                    type="button"
                    onClick={() => toggleRound(round.id)}
                    className={`flex w-full items-start gap-2.5 rounded-[11px] border px-2.5 py-2.5 text-left transition-colors ${
                      checked
                        ? 'border-clay/35 bg-clay/[0.06]'
                        : 'border-transparent hover:border-[var(--cds-border)] hover:bg-[var(--cds-fill-ghost-hover)]'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border ${
                        checked ? 'border-clay bg-clay text-white' : 'border-[var(--cds-border-strong)]'
                      }`}
                    >
                      {checked && <Check size={10} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[10.5px] font-medium text-[var(--cds-text-secondary)]">
                        第 {round.index} 轮
                        {round.user && <span className="tabular-nums opacity-55">{formatExportTime(round.user.createdAt)}</span>}
                        <span className="ml-auto shrink-0 text-[9.5px] font-normal text-[var(--cds-text-muted)]">
                          {round.assistants.length ? `${round.assistants.length} 条回答` : '无回答'}
                        </span>
                      </span>
                      <span className="mt-1 line-clamp-2 block text-[11px] leading-[1.55] text-[var(--cds-text-muted)]">
                        {preview || '（无文字内容）'}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--cds-border)] px-4 py-3">
              <div className="flex items-center gap-1.5">
                <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--cds-text-muted)]">模板</span>
                {EXPORT_TEMPLATES.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    title={item.hint}
                    onClick={() => setTemplateId(item.id)}
                    className={`flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[10.5px] font-medium transition-colors ${
                      templateId === item.id
                        ? 'border-clay/45 text-[var(--cds-text-primary)]'
                        : 'border-[var(--cds-border)] text-[var(--cds-text-muted)] hover:border-[var(--cds-border-strong)] hover:text-[var(--cds-text-primary)]'
                    }`}
                  >
                    <span
                      className="size-3 rounded-full border"
                      style={{ background: item.bg, borderColor: item.border }}
                    />
                    {item.name}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <OptionPill
                  active={options.includeReasoning}
                  disabled={!hasReasoning}
                  onClick={() => setOptions(value => ({ ...value, includeReasoning: !value.includeReasoning }))}
                >
                  思考过程
                </OptionPill>
                <OptionPill
                  active={options.includeCitations}
                  disabled={!hasCitations}
                  onClick={() => setOptions(value => ({ ...value, includeCitations: !value.includeCitations }))}
                >
                  参考来源
                </OptionPill>
                <OptionPill
                  active={options.includeAttachments}
                  disabled={!hasAttachments}
                  onClick={() => setOptions(value => ({ ...value, includeAttachments: !value.includeAttachments }))}
                >
                  图片附件
                </OptionPill>
              </div>
            </div>

            <div ref={previewRef} className="scroll-quiet min-h-0 flex-1 overflow-auto bg-[var(--cds-surface-0)] px-5 py-5">
              {selectedRounds.length ? (
                <div
                  className="mx-auto shadow-[0_18px_50px_rgba(40,32,20,0.16)]"
                  style={{ width: previewWidth, height: Math.max(1, previewHeight) }}
                >
                  <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'top left', width: EXPORT_CARD_WIDTH }}>
                    <ExportCard
                      conversation={conversation!}
                      rounds={selectedRounds}
                      template={template}
                      options={options}
                      attachmentUrls={attachmentUrls}
                      exportedAt={exportedAt}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 text-center">
                  <ImageDown size={24} className="text-[var(--cds-text-muted)] opacity-50" />
                  <p className="text-[12px] font-medium text-[var(--cds-text-secondary)]">选择左侧的对话轮次</p>
                  <p className="text-[10.5px] text-[var(--cds-text-muted)]">一轮或多轮都可以，右侧会实时预览</p>
                </div>
              )}
            </div>

            <footer className="flex shrink-0 items-center gap-3 border-t border-[var(--cds-border)] px-4 py-3">
              <div className="min-w-0 truncate text-[10px] leading-relaxed text-[var(--cds-text-muted)]">
                {selectedRounds.length ? (
                  <>
                    {selectedRounds.length} 轮 · {pixelWidth} × {pixelHeight || '—'} px
                    {ratio < 2 && !tooLong && <span className="ml-1.5 text-[#a4621d]">长图已自动降低清晰度</span>}
                    {tooLong && <span className="ml-1.5 text-red-500">内容过长，请减少轮次</span>}
                  </>
                ) : (
                  '未选择轮次'
                )}
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => void copy()}
                  disabled={!canExport}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--cds-border-strong)] px-3 text-[11.5px] font-medium text-[var(--cds-text-secondary)] transition-colors hover:border-clay/50 hover:text-[var(--cds-text-primary)] disabled:opacity-40"
                >
                  {exporting === 'copy' ? <Loader2 size={12} className="animate-spin" /> : copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? '已复制' : '复制图片'}
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={!canExport}
                  className="flex h-8 items-center gap-1.5 rounded-lg bg-clay px-3.5 text-[11.5px] font-semibold text-white transition-colors hover:bg-clay-hover disabled:opacity-40"
                >
                  {exporting === 'save' ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                  导出 PNG
                </button>
              </div>
            </footer>
          </div>
        </div>

        {selectedRounds.length > 0 && conversation && createPortal(
          <div
            aria-hidden="true"
            style={{ position: 'fixed', left: -20000, top: 0, width: EXPORT_CARD_WIDTH, pointerEvents: 'none', zIndex: -1 }}
          >
            <ExportCard
              ref={exportRef}
              conversation={conversation}
              rounds={selectedRounds}
              template={template}
              options={options}
              attachmentUrls={attachmentUrls}
              exportedAt={exportedAt}
            />
          </div>,
          document.body,
        )}
      </div>
    </Modal>
  )
}
