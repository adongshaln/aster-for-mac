import {
  AlertCircle,
  ArrowUp,
  FolderOpen,
  Globe,
  HelpCircle,
  ImagePlus,
  Loader2,
  Paperclip,
  Quote,
  Settings2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Terminal,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ModelPicker } from '@/components/ModelPicker'
import { ReasoningPicker } from '@/components/ReasoningPicker'
import { Popover } from '@/components/ui/Popover'
import { Switch } from '@/components/ui/Switch'
import { useAppStore, activeConversation, activeProfile, conversationTokens } from '@/state/store'
import { defaultInjectionPresets } from '@shared/presets'
import type { Attachment, PermissionMode } from '@shared/types'
import { cn, readImageFile } from '@/lib/utils'

const PERMISSION_LABELS: Record<PermissionMode, { label: string; desc: string }> = {
  auto: { label: '自动执行', desc: '允许模型直接执行读写与终端工具' },
  'ask-destructive': { label: '写入前确认', desc: '写入、修改文件与运行命令前弹窗确认' },
  'plan-only': { label: '只读规划', desc: '仅允许读取与搜索，禁止修改文件或运行命令' },
}

export function Composer() {
  const conversation = useAppStore(activeConversation)
  const profile = useAppStore(activeProfile)
  const config = useAppStore(state => state.config)
  const activeRequest = useAppStore(state => state.activeRequest)
  const composerQuote = useAppStore(state => state.composerQuote)
  const pendingApproval = useAppStore(state => state.pendingApproval)
  const pendingQuestion = useAppStore(state => state.pendingQuestion)
  const setComposerQuote = useAppStore(state => state.setComposerQuote)
  const sendMessage = useAppStore(state => state.sendMessage)
  const stopGeneration = useAppStore(state => state.stopGeneration)
  const openSettings = useAppStore(state => state.openSettings)
  const showToast = useAppStore(state => state.showToast)
  const createConversation = useAppStore(state => state.createConversation)
  const pickWorkspaceDirectory = useAppStore(state => state.pickWorkspaceDirectory)
  const setPermissionMode = useAppStore(state => state.setPermissionMode)
  const toggleWebSearch = useAppStore(state => state.toggleWebSearch)
  const toggleHarnessTools = useAppStore(state => state.toggleHarnessTools)
  const togglePromptInjection = useAppStore(state => state.togglePromptInjection)
  const setActiveInjectionPreset = useAppStore(state => state.setActiveInjectionPreset)
  const toggleInjectionEntry = useAppStore(state => state.toggleInjectionEntry)
  const resolveToolApproval = useAppStore(state => state.resolveToolApproval)
  const resolveUserQuestion = useAppStore(state => state.resolveUserQuestion)

  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [focused, setFocused] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [composing, setComposing] = useState(false)
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({})
  const [toolsOpen, setToolsOpen] = useState(false)
  const toolsBtnRef = useRef<HTMLButtonElement>(null)
  const [injectionOpen, setInjectionOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const injectionBtnRef = useRef<HTMLButtonElement>(null)

  const streamingHere = Boolean(activeRequest && conversation && activeRequest.conversationId === conversation.id)
  const anyStreaming = Boolean(activeRequest)
  const model = conversation?.model || profile?.chatModel || ''
  const hasProfile = Boolean(profile)
  const hasModel = Boolean(model)
  const canSend = Boolean(text.trim() || attachments.length) && !anyStreaming

  const settings = config?.settings
  const workspaceDir = conversation?.workspaceDir || settings?.workspaceDir || '~'
  const workspaceShort = workspaceDir.split('/').filter(Boolean).pop() || workspaceDir
  const webSearchEnabled = settings?.webSearchEnabled ?? true
  const harnessToolsEnabled = settings?.harnessToolsEnabled ?? true
  const permissionMode: PermissionMode = settings?.permissionMode ?? 'auto'
  const promptInjectionEnabled = settings?.promptInjectionEnabled ?? false
  const injectionPresets = settings?.injectionPresets?.length
    ? settings.injectionPresets
    : defaultInjectionPresets()
  const activeInjectionPreset =
    injectionPresets.find(p => p.id === settings?.activeInjectionPresetId) ?? injectionPresets[0]
  const enabledInjectionCount = activeInjectionPreset
    ? activeInjectionPreset.entries.filter(e => e.enabled).length
    : 0

  const contextLimit = profile?.contextLimit || 128_000
  const usedTokens =
    (conversation ? conversationTokens(conversation) : 0) +
    Math.ceil(text.length / 3.5) +
    attachments.length * 1200
  const occupancy = Math.min(1, usedTokens / contextLimit)

  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 280)}px`
  }, [text])

  useEffect(() => {
    if (!activeRequest) textareaRef.current?.focus()
  }, [activeRequest])

  useEffect(() => {
    if (composerQuote) {
      textareaRef.current?.focus()
    }
  }, [composerQuote])

  useEffect(() => {
    setCustomAnswers({})
  }, [pendingQuestion?.requestId, pendingQuestion?.callId])

  const addFiles = async (files: File[] | FileList) => {
    const images = Array.from(files).filter(file => file.type.startsWith('image/'))
    if (!images.length) return
    const remaining = 4 - attachments.length
    if (remaining <= 0) {
      showToast('每条消息最多附加 4 张图片', 'info')
      return
    }
    setUploading(true)
    try {
      for (const file of images.slice(0, remaining)) {
        const loaded = await readImageFile(file)
        const saved = await window.aster.attachments.save({
          name: loaded.name,
          mimeType: loaded.mimeType,
          base64: loaded.base64,
          width: loaded.width,
          height: loaded.height,
        })
        setAttachments(current => [...current, saved])
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const submit = async () => {
    if (!canSend) return
    if (!hasProfile) {
      openSettings('services')
      showToast('请先配置一个 API 服务', 'error')
      return
    }
    if (!hasModel) {
      openSettings('services')
      showToast('请先为该服务选择模型', 'error')
      return
    }
    if (!conversation) createConversation()
    const prefix = composerQuote ? `> ${composerQuote}\n\n` : ''
    const content = prefix + text
    const files = attachments
    setText('')
    setComposerQuote('')
    setAttachments([])
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
        textareaRef.current.focus()
      }
    })
    await sendMessage(content, files)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (composing || event.nativeEvent.isComposing || event.keyCode === 229) return
    const withModifier = event.metaKey || event.ctrlKey
    const shouldSend = config?.settings.enterToSend
      ? event.key === 'Enter' && !event.shiftKey && !withModifier
      : event.key === 'Enter' && withModifier
    if (shouldSend) {
      event.preventDefault()
      void submit()
    }
  }

  const cyclePermissionMode = () => {
    const order: PermissionMode[] = ['auto', 'ask-destructive', 'plan-only']
    const next = order[(order.indexOf(permissionMode) + 1) % order.length]
    void setPermissionMode(next)
  }

  return (
    <div className="w-full">
      {/* 1. Interactive Tool Approval Card (`open-claude-ui` McpToolDecisionCard) */}
      {pendingApproval && (
        <div className="modal-panel mb-2.5 overflow-hidden rounded-[16px] border border-clay/50 bg-[var(--cds-surface-1)] p-3.5 shadow-[0_4px_20px_rgba(217,119,87,0.14)]">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-clay">
            <ShieldAlert size={14} />
            <span>需要授权执行工具：{pendingApproval.activity.name}</span>
            <span className="ml-auto font-mono text-[10.5px] text-[var(--cds-text-muted)]">
              {pendingApproval.activity.label}
            </span>
          </div>
          {pendingApproval.activity.input && (
            <pre className="scroll-quiet mt-2 max-h-[110px] overflow-auto rounded-lg border border-[var(--cds-border)] bg-[var(--cds-surface-0)] p-2 font-mono text-[10.5px] text-[var(--cds-text-secondary)]">
              {JSON.stringify(pendingApproval.activity.input, null, 2)}
            </pre>
          )}
          <div className="mt-2.5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void resolveToolApproval('deny')}
              className="h-7 rounded-lg border border-[var(--cds-border)] px-3 text-[11px] font-medium text-[var(--cds-text-secondary)] hover:bg-[var(--cds-fill-ghost-hover)]"
            >
              拒绝执行
            </button>
            <button
              type="button"
              onClick={() => void resolveToolApproval('allow_once')}
              className="h-7 rounded-lg bg-clay px-3 text-[11px] font-semibold text-white hover:bg-clay-hover"
            >
              允许本次
            </button>
          </div>
        </div>
      )}

      {/* 2. Interactive Ask-User-Question Card */}
      {pendingQuestion && (
        <div className="modal-panel scroll-quiet mb-2.5 max-h-[min(42vh,360px)] overflow-y-auto rounded-[16px] border border-[var(--cds-border-strong)] bg-[var(--cds-surface-1)] p-3.5 shadow-md">
          {pendingQuestion.questions.map(q => (
            <div key={q.id} className="space-y-2 py-2 first:pt-0 last:pb-0">
              <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--cds-text-primary)]">
                <HelpCircle size={14} className="text-clay" />
                <span>{q.question}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(q.options ?? []).map(opt => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => void resolveUserQuestion({ [q.id]: opt.label })}
                    aria-pressed={pendingQuestion.answers[q.id] === opt.label}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-left text-[11.5px] font-medium transition-all hover:border-clay hover:text-clay',
                      pendingQuestion.answers[q.id] === opt.label
                        ? 'border-clay bg-clay/10 text-clay'
                        : 'border-[var(--cds-border)] bg-[var(--cds-surface-2)]',
                    )}
                  >
                    <div>{opt.label}</div>
                    {opt.description && (
                      <div className="text-[10px] text-[var(--cds-text-muted)]">{opt.description}</div>
                    )}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <input
                  value={customAnswers[q.id] ?? ''}
                  onChange={e => setCustomAnswers(current => ({ ...current, [q.id]: e.target.value }))}
                  placeholder="或输入自定义回答…"
                  className="h-7 flex-1 rounded-lg border border-[var(--cds-border)] bg-[var(--cds-surface-2)] px-2.5 text-[11.5px] outline-none focus:border-clay"
                />
                <button
                  type="button"
                  disabled={!customAnswers[q.id]?.trim()}
                  onClick={() => {
                    const ans = customAnswers[q.id]?.trim() ?? ''
                    void resolveUserQuestion({ [q.id]: ans })
                  }}
                  className="h-7 rounded-lg bg-clay px-3 text-[11px] font-semibold text-white disabled:opacity-40"
                >
                  提交
                </button>
              </div>
              {pendingQuestion.answers[q.id] && (
                <div className="text-[10.5px] text-clay">已回答：{pendingQuestion.answers[q.id]}</div>
              )}
            </div>
          ))}
          {pendingQuestion.questions.length > 1 && (
            <p className="mt-2 text-[10.5px] text-[var(--cds-text-muted)]">回答全部问题后将自动继续。</p>
          )}
        </div>
      )}

      {/* 3. Studio Workspace & Tool Chips Strip (`dsh-claude-style` hairline chips above card) */}
      <div className="mb-1.5 flex min-w-0 flex-wrap items-center gap-1.5 px-1">
        <button
          type="button"
          onClick={() => void pickWorkspaceDirectory()}
          className="flex h-6 items-center gap-1.5 rounded-full border border-[var(--cds-border)] bg-[var(--cds-surface-2)]/80 px-2.5 text-[11px] font-medium text-[var(--cds-text-secondary)] transition-colors hover:border-[var(--cds-border-strong)] hover:text-[var(--cds-text-primary)]"
          title={`当前工作区：${workspaceDir}（点击切换目录）`}
        >
          <FolderOpen size={11} className="text-clay" />
          <span className="max-w-[150px] truncate font-mono">{workspaceShort}</span>
        </button>

        <button ref={toolsBtnRef} type="button" onClick={() => setToolsOpen(value => !value)} aria-expanded={toolsOpen} className="flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-[var(--cds-border)] px-2.5 text-[11px] text-[var(--cds-text-secondary)] hover:bg-[var(--cds-fill-ghost-hover)]">
          <Settings2 size={12} />工具与权限
        </button>
        <Popover open={toolsOpen} onClose={() => setToolsOpen(false)} anchorRef={toolsBtnRef} width={280} side="top">
          <div className="space-y-3 p-4">
            <p className="text-xs font-medium text-[var(--cds-text-secondary)]">本对话的工具</p>
            <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void toggleWebSearch()}
          className={cn(
            'flex h-6 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition-colors',
            webSearchEnabled
              ? 'border-clay/40 bg-clay/10 text-clay'
              : 'border-[var(--cds-border)] bg-[var(--cds-surface-2)]/80 text-[var(--cds-text-muted)] hover:text-[var(--cds-text-secondary)]',
          )}
          title="实时并发联网搜索 (web_search / web_fetch)"
        >
          <Globe size={11} />
          <span>联网搜索</span>
        </button>

        <button
          type="button"
          onClick={() => void toggleHarnessTools()}
          className={cn(
            'flex h-6 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition-colors',
            harnessToolsEnabled
              ? 'border-clay/40 bg-clay/10 text-clay'
              : 'border-[var(--cds-border)] bg-[var(--cds-surface-2)]/80 text-[var(--cds-text-muted)] hover:text-[var(--cds-text-secondary)]',
          )}
          title="读取、编辑文件，运行命令并完成任务"
        >
          <Terminal size={11} />
          <span>任务工具</span>
        </button>

        {harnessToolsEnabled && (
          <button
            type="button"
            onClick={cyclePermissionMode}
            className="flex h-6 items-center gap-1 rounded-full border border-[var(--cds-border)] bg-[var(--cds-surface-2)]/80 px-2.5 text-[11px] font-medium text-[var(--cds-text-secondary)] transition-colors hover:border-[var(--cds-border-strong)] hover:text-[var(--cds-text-primary)]"
            title={PERMISSION_LABELS[permissionMode].desc}
          >
            {permissionMode === 'auto' ? (
              <ShieldCheck size={11} className="text-emerald-600 dark:text-emerald-400" />
            ) : permissionMode === 'ask-destructive' ? (
              <ShieldAlert size={11} className="text-clay" />
            ) : (
              <Shield size={11} className="text-[var(--cds-text-muted)]" />
            )}
            <span>{PERMISSION_LABELS[permissionMode].label}</span>
          </button>
        )}

            </div>
            <p className="text-xs leading-relaxed text-[var(--cds-text-muted)]">{harnessToolsEnabled ? PERMISSION_LABELS[permissionMode].desc : '任务工具已关闭，仅进行对话。'}</p>
          </div>
        </Popover>

        <button
          ref={injectionBtnRef}
          type="button"
          onClick={() => setInjectionOpen(v => !v)}
          className={cn(
            'flex h-6 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition-colors',
            promptInjectionEnabled && enabledInjectionCount > 0
              ? 'border-clay/40 bg-clay/10 text-clay'
              : 'border-[var(--cds-border)] bg-[var(--cds-surface-2)]/80 text-[var(--cds-text-muted)] hover:text-[var(--cds-text-secondary)]',
          )}
          title="提示词按需注入（Ny-Gemini 越狱演示模式 / 自定义注入）"
        >
          <Sparkles size={11} />
          <span>
            {promptInjectionEnabled
              ? `注入 · ${enabledInjectionCount} 项生效`
              : '提示词注入'}
          </span>
        </button>

        <Popover
          open={injectionOpen}
          onClose={() => setInjectionOpen(false)}
          anchorRef={injectionBtnRef}
          width={340}
          side="top"
          className="p-0"
        >
          <div className="flex items-center justify-between border-b border-[var(--cds-border)] px-3.5 py-2.5">
            <div>
              <div className="text-[12px] font-semibold">提示词按需注入</div>
              <div className="text-[10px] text-[var(--cds-text-muted)]">
                {activeInjectionPreset?.name ?? '未选择预设'}
              </div>
            </div>
            <Switch
              checked={promptInjectionEnabled}
              onChange={() => void togglePromptInjection()}
              label="启用提示词注入"
            />
          </div>

          {injectionPresets.length > 1 && (
            <div className="flex gap-1 overflow-x-auto border-b border-[var(--cds-border)] px-3 py-1.5 scroll-invisible">
              {injectionPresets.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => void setActiveInjectionPreset(p.id)}
                  className={cn(
                    'shrink-0 rounded-md px-2 py-1 text-[10.5px] font-medium transition-colors',
                    p.id === activeInjectionPreset?.id
                      ? 'bg-clay/12 text-clay'
                      : 'text-[var(--cds-text-secondary)] hover:bg-[var(--cds-fill-ghost-hover)]',
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}

          <div className="scroll-quiet max-h-[260px] divide-y divide-[var(--cds-border)]/60 overflow-y-auto px-2 py-1">
            {(activeInjectionPreset?.entries ?? []).map(entry => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-2.5 rounded-lg px-2 py-2 hover:bg-[var(--cds-fill-ghost-hover)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[11.5px] font-medium text-[var(--cds-text-primary)]">
                      {entry.name}
                    </span>
                    <span className="shrink-0 rounded bg-black/[0.05] px-1 py-0.2 font-mono text-[9px] uppercase text-[var(--cds-text-muted)] dark:bg-white/[0.06]">
                      {entry.role}
                    </span>
                    <span className="shrink-0 font-mono text-[9px] text-[var(--cds-text-muted)]">
                      {entry.position === 'before_history'
                        ? '前置'
                        : entry.position === 'in_chat'
                          ? `D=${entry.depth ?? 0}`
                          : '后置'}
                    </span>
                  </div>
                  {entry.description && (
                    <div className="mt-0.5 truncate text-[10px] text-[var(--cds-text-muted)]">
                      {entry.description}
                    </div>
                  )}
                </div>
                <Switch
                  checked={entry.enabled}
                  onChange={() => {
                    if (activeInjectionPreset) {
                      void toggleInjectionEntry(activeInjectionPreset.id, entry.id)
                      if (!promptInjectionEnabled) void togglePromptInjection()
                    }
                  }}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-[var(--cds-border)] bg-[var(--cds-surface-0)] px-3.5 py-2">
            <span className="text-[10px] text-[var(--cds-text-muted)]">
              {promptInjectionEnabled ? `当前已激活 ${enabledInjectionCount} 条注入指令` : '总开关已关闭，暂不注入'}
            </span>
            <button
              type="button"
              onClick={() => {
                setInjectionOpen(false)
                openSettings('injections')
              }}
              className="text-[11px] font-medium text-clay hover:underline"
            >
              编辑与管理条目 →
            </button>
          </div>
        </Popover>
      </div>

      {/* 4. Main Composer Card */}
      <div
        data-focused={focused && !anyStreaming}
        onDragOver={event => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={event => {
          if (event.currentTarget === event.target) setDragging(false)
        }}
        onDrop={event => {
          event.preventDefault()
          setDragging(false)
          if (event.dataTransfer.files.length) void addFiles(event.dataTransfer.files)
        }}
        className={cn(
          'composer-shell relative flex w-full flex-col gap-1 rounded-composer border border-[var(--cds-border)] bg-[var(--cds-surface-2)] p-3',
          dragging && 'border-clay/60',
        )}
      >
        {dragging && (
          <div className="pointer-events-none absolute inset-1 z-20 flex items-center justify-center rounded-[16px] border-2 border-dashed border-clay/50 bg-clay/[0.06]">
            <div className="flex items-center gap-1.5 rounded-full bg-[var(--cds-surface-popover)] px-3 py-1.5 text-[11px] font-semibold text-clay shadow-sm">
              <ImagePlus size={12} />
              松开以添加图片
            </div>
          </div>
        )}

        {/* Quote Reply Banner */}
        {composerQuote && (
          <div className="mb-1 flex items-center gap-2 rounded-[10px] border-l-2 border-clay bg-[var(--cds-fill-ghost-hover)] px-2.5 py-1.5 text-[11.5px] text-[var(--cds-text-secondary)]">
            <Quote size={12} className="shrink-0 text-clay" />
            <span className="min-w-0 flex-1 truncate">{composerQuote}</span>
            <button
              type="button"
              onClick={() => setComposerQuote('')}
              className="rounded p-0.5 text-[var(--cds-text-muted)] hover:text-[var(--cds-text-primary)]"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {attachments.length > 0 && (
          <div className="scroll-invisible flex items-center gap-2 overflow-x-auto pb-1 pt-0.5">
            {attachments.map(attachment => (
              <div
                key={attachment.id}
                className="group/thumb relative size-[58px] shrink-0 overflow-hidden rounded-[9px] border border-[var(--cds-border)] bg-[var(--cds-surface-1)]"
              >
                <img
                  src={attachment.url}
                  alt={attachment.name}
                  className="size-full object-cover"
                  draggable={false}
                />
                <button
                  type="button"
                  onClick={() => setAttachments(current => current.filter(item => item.id !== attachment.id))}
                  className="absolute right-1 top-1 flex size-[18px] items-center justify-center rounded-full border border-white/20 bg-black/55 text-white opacity-0 backdrop-blur transition-opacity group-hover/thumb:opacity-100"
                  title="移除图片"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            {uploading && (
              <div className="flex size-[58px] shrink-0 items-center justify-center rounded-[9px] border border-[var(--cds-border)] bg-[var(--cds-surface-1)] text-clay">
                <Loader2 size={14} className="animate-spin" />
              </div>
            )}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={text}
          onChange={event => setText(event.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          onPaste={event => {
            const files = Array.from(event.clipboardData.items)
              .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
              .map(item => item.getAsFile())
              .filter((file): file is File => Boolean(file))
            if (files.length) {
              event.preventDefault()
              void addFiles(files)
            }
          }}
          rows={1}
          placeholder={
            anyStreaming
              ? 'Aster 正在回复…'
              : conversation?.messages.length
                ? '继续对话，或让 Aster 检索网页、读写代码、运行终端命令…'
                : '和 Aster 聊聊任何事，或委派编码、检索与分析任务…'
          }
          className="composer-textarea scroll-quiet w-full"
        />

        <div className="flex items-center gap-1.5 pt-0.5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={event => {
              if (event.target.files) void addFiles(event.target.files)
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex size-8 items-center justify-center rounded-full text-[var(--cds-text-secondary)] transition-colors hover:bg-[var(--cds-fill-ghost-hover)] hover:text-[var(--cds-text-primary)] disabled:opacity-40"
            title="添加图片"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
          </button>

          {/* dsh-claude-style unified model & effort seat + pie context meter */}
          {hasProfile ? (
            <div className="flex items-center gap-1">
              <ModelPicker compact />
              <ReasoningPicker compact />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => openSettings('services')}
              className="flex h-7 items-center gap-1.5 rounded-full border border-dashed border-clay/40 px-2.5 text-[11px] font-medium text-clay transition-colors hover:bg-clay/[0.06]"
            >
              <AlertCircle size={11} />
              连接模型
            </button>
          )}

          <div className="ml-auto flex items-center gap-2.5">
            {/* dsh-claude-style Pie Context Meter */}
            <DshPieMeter usedTokens={usedTokens} contextLimit={contextLimit} occupancy={occupancy} />

            {anyStreaming ? (
              <button
                type="button"
                onClick={() => stopGeneration()}
                className="flex size-8 items-center justify-center rounded-full border border-[var(--cds-border-strong)] bg-[var(--cds-surface-1)] text-[var(--cds-text-primary)] transition-all hover:border-clay/50 hover:text-clay active:scale-[0.94]"
                title="停止生成"
              >
                <Square size={10} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!canSend}
                className={cn(
                  'flex size-8 items-center justify-center rounded-full transition-all duration-150 active:scale-[0.94]',
                  canSend
                    ? 'bg-clay text-white shadow-[0_3px_12px_rgba(217,119,87,0.3)] hover:bg-clay-hover'
                    : 'bg-[var(--cds-fill-secondary)] text-[var(--cds-text-muted)]',
                )}
                title="发送"
              >
                <ArrowUp size={15} strokeWidth={2.4} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--cds-text-muted)]">
          {streamingHere ? (
            <>
              <span className="size-1.5 animate-pulse rounded-full bg-clay" />
              正在生成，可随时停止
            </>
          ) : hasProfile && hasModel ? (
            <>
              <span>{config?.settings.enterToSend ? 'Enter 发送 · Shift + Enter 换行' : '⌘ + Enter 发送'}</span>

            </>
          ) : (
            <button
              type="button"
              onClick={() => openSettings('services')}
              className="flex items-center gap-1 text-clay hover:underline"
            >
              <Settings2 size={10} />
              先在设置中连接一个模型服务
            </button>
          )}
        </div>

      </div>
    </div>
  )
}

/**
 * `dsh-claude-style` Context Pie Meter (`Context meter · 上下文计量` in STYLE.md):
 * Draws a two-sector pie chart where the smaller share stands out to the outer radius.
 */
function DshPieMeter({
  usedTokens,
  contextLimit,
  occupancy,
}: {
  usedTokens: number
  contextLimit: number
  occupancy: number
}) {
  const pct = Math.min(100, Math.round(occupancy * 100))
  const usedK = (usedTokens / 1000).toFixed(usedTokens > 10_000 ? 0 : 1)
  const limitK = Math.round(contextLimit / 1000)
  const angle = Math.max(0.04, Math.min(0.999, occupancy)) * 2 * Math.PI - Math.PI / 2
  const r = 7.5
  const cx = 9
  const cy = 9
  const x = cx + r * Math.cos(angle)
  const y = cy + r * Math.sin(angle)
  const largeArc = occupancy > 0.5 ? 1 : 0
  const sectorPath = `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${largeArc} 1 ${x} ${y} Z`
  const color = occupancy > 0.85 ? '#d95926' : occupancy > 0.65 ? '#d97757' : '#3d7550'

  return (
    <div
      className="hidden items-center gap-1.5 text-[10.5px] tabular-nums text-[var(--cds-text-muted)] sm:flex"
      title={`上下文占用：约 ${usedTokens.toLocaleString()} / ${contextLimit.toLocaleString()} tokens (${pct}%)`}
    >
      <svg className="size-[18px]" viewBox="0 0 18 18">
        <circle cx={cx} cy={cy} r={r} fill="currentColor" className="opacity-20" />
        <path d={sectorPath} fill={color} />
      </svg>
      <span>
        {usedK}k / {limitK}k
      </span>
    </div>
  )
}
