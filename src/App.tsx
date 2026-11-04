import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react'
import { ArtifactPane } from '@/components/ArtifactPane'
import { ChatView } from '@/components/ChatView'
import { Sidebar } from '@/components/Sidebar'
import { SettingsDialog } from '@/components/SettingsDialog'
import { UsageDialog } from '@/components/UsageDialog'
import { ImageDialog } from '@/components/ImageDialog'
import { Toast } from '@/components/ui/Toast'
import { LoadingScreen } from '@/components/ui/Loading'
import { AsterMark } from '@/components/AsterMark'
import { TopBar } from '@/components/TopBar'
import { useAppStore } from '@/state/store'
import { cn } from '@/lib/utils'

export function App() {
  return (
    <AppErrorBoundary>
      <AppShell />
    </AppErrorBoundary>
  )
}

function AppShell() {
  const init = useAppStore(state => state.init)
  const ready = useAppStore(state => state.ready)
  const initError = useAppStore(state => state.initError)
  const config = useAppStore(state => state.config)
  const sidebarCollapsed = useAppStore(state => state.sidebarCollapsed)
  const fullscreen = useAppStore(state => state.windowFullscreen)
  const settingsOpen = useAppStore(state => state.settingsOpen)
  const usageOpen = useAppStore(state => state.usageOpen)
  const openImage = useAppStore(state => state.imageOpen)
  const activeArtifact = useAppStore(state => state.activeArtifact)
  const setActiveArtifact = useAppStore(state => state.setActiveArtifact)
  const createConversation = useAppStore(state => state.createConversation)
  const openSettings = useAppStore(state => state.openSettings)
  const closeSettings = useAppStore(state => state.closeSettings)
  const openUsage = useAppStore(state => state.openUsage)
  const closeUsage = useAppStore(state => state.closeUsage)
  const closeImage = useAppStore(state => state.closeImage)
  const focusSearch = useAppStore(state => state.focusSearch)
  const toggleSidebar = useAppStore(state => state.toggleSidebar)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    document.documentElement.dataset.fullscreen = fullscreen ? 'true' : 'false'
  }, [fullscreen])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey
      if (meta && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        createConversation()
        return
      }
      if (meta && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (sidebarCollapsed) toggleSidebar()
        focusSearch()
        return
      }
      if (meta && event.key === ',') {
        event.preventDefault()
        openSettings('general')
        return
      }
      if (meta && event.key.toLowerCase() === 'u') {
        event.preventDefault()
        openUsage()
        return
      }
      if (meta && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        toggleSidebar()
        return
      }
      if (event.key === 'Escape') {
        if (settingsOpen) {
          event.preventDefault()
          closeSettings()
        } else if (usageOpen) {
          event.preventDefault()
          closeUsage()
        } else if (openImage) {
          event.preventDefault()
          closeImage()
        } else if (activeArtifact) {
          event.preventDefault()
          setActiveArtifact(null)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sidebarCollapsed, settingsOpen, usageOpen, openImage, activeArtifact, createConversation, focusSearch, openSettings, closeSettings, openUsage, closeUsage, closeImage, setActiveArtifact, toggleSidebar])

  if (!ready) return <LoadingScreen />

  if (initError) {
    return (
      <div className="app-vibrancy flex h-full flex-col items-center justify-center gap-4 px-10 text-center">
        <AsterMark size={44} />
        <h1 className="text-[16px] font-semibold">Aster 无法完成启动</h1>
        <p className="max-w-[460px] text-[12px] leading-relaxed text-[var(--cds-text-secondary)]">{initError}</p>
        <p className="max-w-[460px] text-[10.5px] leading-relaxed text-[var(--cds-text-muted)]">
          如果你在浏览器里打开页面，请改用 <code className="rounded bg-[var(--cds-fill-secondary)] px-1 py-0.5 font-mono">npm run dev</code> 启动 Electron 窗口。
        </p>
      </div>
    )
  }

  return (
    <div className="app-vibrancy relative flex h-full w-full overflow-hidden">
      {!sidebarCollapsed && <Sidebar />}
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col">
          <TopBar />
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <ChatView />
            {activeArtifact && (
              <ArtifactPane
                artifact={activeArtifact}
                onClose={() => setActiveArtifact(null)}
              />
            )}
          </div>
        </div>
      </div>
      <SettingsDialog />
      <UsageDialog />
      <ImageDialog />
      <Toast />
    </div>
  )
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Aster UI error', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-vibrancy flex h-full flex-col items-center justify-center gap-3 px-10 text-center">
          <AsterMark size={42} />
          <h1 className="text-[15px] font-semibold">界面遇到了一个问题</h1>
          <p className="max-w-[520px] break-words text-[11.5px] leading-relaxed text-[var(--cds-text-secondary)]">
            {this.state.error.message}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-1 h-8 rounded-lg bg-clay px-3 text-[11.5px] font-semibold text-white"
          >
            重新加载
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
