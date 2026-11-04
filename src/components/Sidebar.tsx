import {
  BarChart3,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AsterMark } from '@/components/AsterMark'
import { ConfirmDialog } from '@/components/ui/Modal'
import { IconButton } from '@/components/ui/IconButton'
import { useAppStore } from '@/state/store'
import type { Conversation } from '@shared/types'
import { cn, dayBucket, relativeTime } from '@/lib/utils'

const groups: { key: ReturnType<typeof dayBucket>; label: string }[] = [
  { key: 'today', label: '今天' },
  { key: 'yesterday', label: '昨天' },
  { key: 'week', label: '过去 7 天' },
  { key: 'older', label: '更早' },
]

export function Sidebar() {
  const conversations = useAppStore(state => state.conversations)
  const activeId = useAppStore(state => state.activeId)
  const fullscreen = useAppStore(state => state.windowFullscreen)
  const searchFocusNonce = useAppStore(state => state.searchFocusNonce)
  const createConversation = useAppStore(state => state.createConversation)
  const selectConversation = useAppStore(state => state.selectConversation)
  const deleteConversation = useAppStore(state => state.deleteConversation)
  const togglePin = useAppStore(state => state.togglePin)
  const openSettings = useAppStore(state => state.openSettings)
  const openUsage = useAppStore(state => state.openUsage)
  const appInfo = useAppStore(state => state.appInfo)

  const [query, setQuery] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searchFocusNonce > 0) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [searchFocusNonce])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const list = normalized
      ? conversations.filter(conversation => (
          conversation.title.toLowerCase().includes(normalized)
          || conversation.messages.some(message => message.content.toLowerCase().includes(normalized))
        ))
      : conversations
    return [...list].sort((left, right) => right.updatedAt - left.updatedAt)
  }, [conversations, query])

  const pinned = filtered.filter(conversation => conversation.pinned)
  const recent = filtered.filter(conversation => !conversation.pinned)
  const grouped = groups
    .map(group => ({ ...group, items: recent.filter(conversation => dayBucket(conversation.updatedAt) === group.key) }))
    .filter(group => group.items.length > 0)

  const renderItem = (conversation: Conversation) => {
    const active = conversation.id === activeId
    return (
      <div
        key={conversation.id}
        className="group/item relative"
      >
        <button
          type="button"
          onClick={() => selectConversation(conversation.id)}
          className={cn(
            'relative flex w-full items-center gap-2 rounded-[8px] px-2.5 py-[8px] text-left transition-colors duration-150',
            active
              ? 'bg-[var(--cds-fill-ghost-selected)] text-[var(--cds-text-primary)]'
              : 'text-[var(--cds-text-secondary)] hover:bg-[var(--cds-fill-ghost-hover)] hover:text-[var(--cds-text-primary)]',
          )}
        >
          <div className="min-w-0 flex-1">
            <div className={cn('truncate text-[12.5px] leading-[1.35]', active ? 'font-semibold' : 'font-medium')}>
              {conversation.title || '新对话'}
            </div>
            <div className="mt-[3px] flex items-center gap-1.5">
              <span className="text-[10px] tabular-nums text-[var(--cds-text-muted)]">{relativeTime(conversation.updatedAt)}</span>
              {conversation.pinned && <Pin size={9} className="text-clay" />}
            </div>
          </div>
        </button>
        <div className="pointer-events-none absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover/item:pointer-events-auto group-hover/item:opacity-100">
          <IconButton
            size="xs"
            title={conversation.pinned ? '取消置顶' : '置顶'}
            onClick={event => {
              event.stopPropagation()
              togglePin(conversation.id)
            }}
            className="bg-[var(--cds-surface-popover)]"
          >
            {conversation.pinned ? <PinOff size={12} /> : <Pin size={12} />}
          </IconButton>
          <IconButton
            size="xs"
            title="删除对话"
            onClick={event => {
              event.stopPropagation()
              setPendingDelete(conversation)
            }}
            className="bg-[var(--cds-surface-popover)] hover:text-red-500"
          >
            <Trash2 size={12} />
          </IconButton>
        </div>
      </div>
    )
  }

  return (
    <aside className="app-sidebar-vibrancy flex h-full w-[264px] shrink-0 flex-col border-r border-[var(--cds-border)]">
      <div
        className="app-drag flex h-[52px] shrink-0 items-end gap-2 pb-[9px] pr-3"
        style={{ paddingLeft: fullscreen ? 16 : 78 }}
      >
        <AsterMark size={21} className="-mb-[1px]" />
        <span className="font-serif text-[17px] font-medium leading-none tracking-[-0.02em] text-[var(--cds-text-primary)]">
          Aster
        </span>
        <span className="mb-[1px] rounded-full border border-[var(--cds-border)] px-1.5 py-[1px] text-[8.5px] font-semibold uppercase tracking-[0.08em] text-[var(--cds-text-muted)]">
          Mac
        </span>
      </div>

      <div className="flex items-center gap-2 px-2.5 pb-2 pt-1">
        <button
          type="button"
          onClick={() => {
            createConversation()
            setQuery('')
          }}
          className="flex h-9 flex-1 items-center gap-2 rounded-[9px] border border-[var(--cds-border)] bg-[var(--cds-surface-2)] px-2.5 text-left text-[12.5px] font-semibold text-[var(--cds-text-primary)] shadow-sm transition-all duration-150 hover:border-[var(--cds-border-strong)] hover:shadow-md active:scale-[0.985]"
        >
          <span className="flex size-5 items-center justify-center rounded-md bg-clay/10 text-clay">
            <Plus size={13} strokeWidth={2.4} />
          </span>
          新对话
          <span className="ml-auto flex items-center gap-0.5">
            <span className="kbd">⌘</span>
            <span className="kbd">N</span>
          </span>
        </button>
      </div>

      <div className="px-2.5 pb-2">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--cds-text-muted)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Escape') {
                setQuery('')
                event.currentTarget.blur()
              }
            }}
            placeholder="搜索对话"
            className="h-8 w-full rounded-lg border border-transparent bg-[var(--cds-fill-ghost-hover)] pl-8 pr-12 text-[12px] text-[var(--cds-text-primary)] outline-none transition-all placeholder:text-[var(--cds-text-muted)] focus:border-[var(--cds-border)] focus:bg-[var(--cds-surface-2)]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--cds-text-muted)] hover:text-[var(--cds-text-primary)]"
            >
              <X size={12} />
            </button>
          ) : (
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-[var(--cds-text-muted)]">⌘K</span>
          )}
        </div>
      </div>

      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {filtered.length === 0 && (
          <div className="px-3 py-10 text-center text-[11.5px] leading-relaxed text-[var(--cds-text-muted)]">
            {query ? '没有找到匹配的对话' : '还没有对话，开始第一次交谈吧'}
          </div>
        )}

        {pinned.length > 0 && (
          <div className="mb-3">
            <SectionLabel label="已置顶" count={pinned.length} />
            <div className="space-y-[2px]">
              {pinned.map(renderItem)}
            </div>
          </div>
        )}

        {grouped.map((group, groupIndex) => (
          <div key={group.key} className={groupIndex > 0 ? 'mt-3' : ''}>
            <SectionLabel label={group.label} />
            <div className="space-y-[2px]">
              {group.items.map(conversation => renderItem(conversation))}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-[var(--cds-border)] p-2.5">
        <button
          type="button"
          onClick={openUsage}
          className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[12.5px] font-medium text-[var(--cds-text-secondary)] transition-colors hover:bg-[var(--cds-fill-ghost-hover)] hover:text-[var(--cds-text-primary)]"
        >
          <BarChart3 size={14} />
          用量
        </button>
        <button
          type="button"
          onClick={() => openSettings('general')}
          className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[12.5px] font-medium text-[var(--cds-text-secondary)] transition-colors hover:bg-[var(--cds-fill-ghost-hover)] hover:text-[var(--cds-text-primary)]"
        >
          <Settings size={14} />
          设置
          <span className="ml-auto text-[10px] font-normal tabular-nums text-[var(--cds-text-muted)]">
            {appInfo ? `v${appInfo.version}` : ''}
          </span>
        </button>
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="删除这个对话？"
        description={pendingDelete ? `「${pendingDelete.title}」及其消息将从本机移除，无法恢复。` : ''}
        confirmLabel="删除"
        onConfirm={() => {
          if (pendingDelete) deleteConversation(pendingDelete.id)
          setPendingDelete(null)
        }}
        onClose={() => setPendingDelete(null)}
      />
    </aside>
  )
}

function SectionLabel({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--cds-text-muted)]">
      <span>{label}</span>
      {count != null && <span className="text-[9px] font-normal opacity-70">{count}</span>}
    </div>
  )
}
