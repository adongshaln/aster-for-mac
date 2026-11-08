import { ImageDown, ImagePlus, PanelLeft, Pin, Plus, Settings } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { useAppStore, activeConversation, activeProfile } from '@/state/store'
import { cn } from '@/lib/utils'

export function TopBar() {
  const conversation = useAppStore(activeConversation)
  const profile = useAppStore(activeProfile)
  const activeRequest = useAppStore(state => state.activeRequest)
  const sidebarCollapsed = useAppStore(state => state.sidebarCollapsed)
  const fullscreen = useAppStore(state => state.windowFullscreen)
  const toggleSidebar = useAppStore(state => state.toggleSidebar)
  const createConversation = useAppStore(state => state.createConversation)
  const openSettings = useAppStore(state => state.openSettings)
  const openImage = useAppStore(state => state.openImage)
  const openImageExport = useAppStore(state => state.openImageExport)
  const togglePin = useAppStore(state => state.togglePin)

  const streamingHere = Boolean(activeRequest && conversation && activeRequest.conversationId === conversation.id)

  return (
    <header
      className="app-drag relative z-20 flex h-[52px] shrink-0 items-center gap-2 border-b border-[var(--cds-border)] px-4"
      style={{ paddingLeft: sidebarCollapsed && !fullscreen ? 80 : 16 }}
    >
      <div className="app-no-drag flex items-center gap-1">
        <IconButton size="sm" onClick={toggleSidebar} title={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}>
          <PanelLeft size={14} />
        </IconButton>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px] font-semibold tracking-[-0.01em] text-[var(--cds-text-primary)]">
            {conversation?.title || '新对话'}
          </span>
          {conversation?.pinned && <Pin size={10} className="shrink-0 text-clay" />}
          {streamingHere && (
            <span className="ml-0.5 flex items-center gap-1 text-[10px] font-medium text-clay">
              <span className="size-1.5 animate-pulse rounded-full bg-clay" />
              生成中
            </span>
          )}
        </div>
        <div className="mt-[1px] flex items-center gap-1 text-[9.5px] text-[var(--cds-text-muted)]">
          <span className="max-w-[200px] truncate">{profile?.name ?? '未配置服务'}</span>
          {conversation?.model && (
            <>
              <span className="opacity-40">/</span>
              <span className="max-w-[220px] truncate font-mono">{conversation.model}</span>
            </>
          )}
        </div>
      </div>

      <div className="app-no-drag flex items-center gap-1">
        {conversation && (
          <IconButton
            size="sm"
            onClick={() => togglePin(conversation.id)}
            title={conversation.pinned ? '取消置顶' : '置顶对话'}
            className={cn(conversation.pinned && 'text-clay')}
          >
            <Pin size={13} />
          </IconButton>
        )}
        <IconButton size="sm" onClick={() => openImageExport()} title="导出对话为图片">
          <ImageDown size={14} />
        </IconButton>
        <IconButton size="sm" onClick={openImage} title="生成图片">
          <ImagePlus size={14} />
        </IconButton>
        <IconButton size="sm" onClick={() => createConversation()} title="新对话（⌘N）">
          <Plus size={14} />
        </IconButton>
        <IconButton size="sm" onClick={() => openSettings('general')} title="设置（⌘,）">
          <Settings size={13.5} />
        </IconButton>
      </div>
    </header>
  )
}
