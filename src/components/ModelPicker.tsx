import { Check, ChevronDown, RefreshCw, Search, Zap } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Popover } from '@/components/ui/Popover'
import { useAppStore, activeConversation, activeProfile } from '@/state/store'
import { cn } from '@/lib/utils'

export function ModelPicker({ compact = false }: { compact?: boolean }) {
  const profile = useAppStore(activeProfile)
  const conversation = useAppStore(activeConversation)
  const chooseModel = useAppStore(state => state.chooseModel)
  const saveConfig = useAppStore(state => state.saveConfig)
  const showToast = useAppStore(state => state.showToast)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [custom, setCustom] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)

  const model = conversation?.model || profile?.chatModel || ''
  const models = profile?.models ?? []
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return normalized
      ? models.filter(item => item.id.toLowerCase().includes(normalized))
      : models
  }, [models, query])

  const refresh = async () => {
    if (!profile) return
    setLoading(true)
    try {
      const result = await window.aster.models.fetch(profile.id)
      const config = useAppStore.getState().config
      if (config?.profiles.some(item => item.id === profile.id)) {
        await saveConfig({
          ...config,
          profiles: config.profiles.map(item => (
            item.id === profile.id
              ? { ...item, models: result.models, lastLatencyMs: result.latencyMs, chatModel: item.chatModel || result.models[0]?.id || '' }
              : item
          )),
        })
      }
      showToast(`已拉取 ${result.models.length} 个模型 · ${result.latencyMs} ms`, 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setLoading(false)
    }
  }

  const choose = async (id: string) => {
    const value = id.trim()
    if (!value) return
    await chooseModel(value)
    setOpen(false)
    setQuery('')
    setCustom('')
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(value => !value)}
        className={cn(
          'flex h-8 min-w-0 items-center gap-1.5 rounded-full border border-[var(--cds-border)] bg-[var(--cds-surface-1)] px-2.5 text-[11.5px] font-medium text-[var(--cds-text-secondary)] transition-all duration-150 hover:border-[var(--cds-border-strong)] hover:text-[var(--cds-text-primary)] active:scale-[0.985]',
          compact && 'h-7 px-2',
        )}
        title="切换模型"
      >
        <Zap size={11} className="shrink-0 text-clay" />
        <span className="max-w-[160px] truncate">{model || '选择模型'}</span>
        <ChevronDown size={11} className={cn('shrink-0 opacity-60 transition-transform', open && 'rotate-180')} />
      </button>

      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        width={360}
        side="top"
        className="flex flex-col"
      >
        <div className="flex items-center justify-between border-b border-[var(--cds-border)] px-3 py-2.5">
          <div>
            <div className="text-[12px] font-semibold">模型</div>
            <div className="mt-0.5 max-w-[220px] truncate text-[10px] text-[var(--cds-text-muted)]">
              {profile?.name ?? '未配置服务'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading || !profile}
            className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium text-[var(--cds-text-secondary)] transition-colors hover:bg-[var(--cds-fill-ghost-hover)] disabled:opacity-40"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            刷新
          </button>
        </div>

        <div className="px-3 pb-1 pt-2">
          <div className="relative">
            <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--cds-text-muted)]" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="搜索模型"
              className="h-8 w-full rounded-lg border border-[var(--cds-border)] bg-[var(--cds-surface-1)] pl-8 pr-2 text-[12px] outline-none focus:border-clay/50"
            />
          </div>
        </div>

        <div className="scroll-quiet max-h-[260px] flex-1 overflow-y-auto px-1.5 py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-[11.5px] leading-relaxed text-[var(--cds-text-muted)]">
              {models.length === 0 ? '这个服务还没有模型列表，点击右上角刷新。' : '没有匹配的模型'}
            </div>
          ) : (
            filtered.map(item => {
              const selected = item.id === model
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void choose(item.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2.5 py-[7px] text-left transition-colors',
                    selected ? 'bg-clay/[0.08]' : 'hover:bg-[var(--cds-fill-ghost-hover)]',
                  )}
                >
                  <span className={cn('min-w-0 flex-1 truncate font-mono text-[11.5px]', selected ? 'font-semibold text-clay' : 'text-[var(--cds-text-primary)]')}>
                    {item.id}
                  </span>
                  {item.ownedBy && <span className="max-w-[90px] truncate text-[9.5px] text-[var(--cds-text-muted)]">{item.ownedBy}</span>}
                  {selected && <Check size={12} className="shrink-0 text-clay" />}
                </button>
              )
            })
          )}
        </div>

        <div className="border-t border-[var(--cds-border)] p-2">
          <div className="flex items-center gap-1.5">
            <input
              value={custom}
              onChange={event => setCustom(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') void choose(custom)
              }}
              placeholder="手动输入模型 ID"
              className="h-8 min-w-0 flex-1 rounded-lg border border-[var(--cds-border)] bg-[var(--cds-surface-1)] px-2.5 font-mono text-[11px] outline-none focus:border-clay/50"
            />
            <button
              type="button"
              onClick={() => void choose(custom)}
              disabled={!custom.trim()}
              className="h-8 shrink-0 rounded-lg bg-[var(--cds-text-primary)] px-2.5 text-[11px] font-semibold text-[var(--cds-surface-1)] disabled:opacity-30"
            >
              使用
            </button>
          </div>
        </div>
      </Popover>
    </>
  )
}
