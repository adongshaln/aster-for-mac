import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  protocol,
  screen,
  shell,
  type IpcMainInvokeEvent,
} from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AppConfig, ChatRequest, ImageRequest, SaveAttachmentInput, ThemeMode } from '../shared/types'
import { fetchModels, generateImage, readAttachmentMime, streamChat, type ChatEmitter } from './api'
import { installSkillFromUrl } from './skills'
import { waitForInteraction } from './async'
import { streamHarness, SDK_VERSION } from './harness'
import {
  appDataDir,
  attachmentsDir,
  attachmentPath,
  clearApiKey,
  getApiKey,
  loadConfig,
  loadConversations,
  saveAttachment,
  saveConfig,
  saveConversations,
} from './store'

app.setName('Aster')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'aster-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

let mainWindow: BrowserWindow | null = null
const activeRequests = new Map<string, AbortController>()
const requestConversations = new Map<string, string>()
const requestCompletions = new Map<string, Promise<void>>()
const pendingApprovals = new Map<string, (decision: 'allow_once' | 'always_allow' | 'deny') => void>()
const pendingQuestions = new Map<string, (answers: Record<string, string>) => void>()

function applyTheme(theme: ThemeMode): void {
  nativeTheme.themeSource = theme === 'light' || theme === 'dark' ? theme : 'system'
}

function sendWindowState(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('window:state', {
    fullscreen: mainWindow.isFullScreen(),
    maximized: mainWindow.isMaximized(),
  })
}

function readWindowBounds(): { x?: number; y?: number; width: number; height: number } {
  try {
    const raw = fs.readFileSync(path.join(appDataDir(), 'window-state.json'), 'utf8')
    const saved = JSON.parse(raw) as { x?: number; y?: number; width?: number; height?: number }
    const width = Math.max(940, Math.min(2400, Number(saved.width) || 1280))
    const height = Math.max(620, Math.min(1600, Number(saved.height) || 840))
    const bounds = { x: Number(saved.x), y: Number(saved.y), width, height }
    if (Number.isFinite(bounds.x) && Number.isFinite(bounds.y)) {
      const display = screen.getDisplayMatching({ x: bounds.x!, y: bounds.y!, width, height })
      const area = display.workArea
      const visible = bounds.x! < area.x + area.width - 80
        && bounds.y! < area.y + area.height - 40
        && bounds.x! + width > area.x + 80
        && bounds.y! + height > area.y + 40
      if (visible) return bounds
    }
    return { width, height }
  } catch {
    return { width: 1280, height: 840 }
  }
}

function saveWindowBounds(window: BrowserWindow): void {
  if (window.isDestroyed() || window.isFullScreen()) return
  try {
    const bounds = window.getBounds()
    fs.writeFileSync(
      path.join(appDataDir(), 'window-state.json'),
      JSON.stringify(bounds),
      'utf8',
    )
  } catch {
    // Window geometry is a convenience; never block closing the app on it.
  }
}

function createWindow(): void {
  const initialBounds = readWindowBounds()
  const window = new BrowserWindow({
    ...initialBounds,
    width: 1280,
    height: 840,
    minWidth: 940,
    minHeight: 620,
    show: false,
    title: 'Aster',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 17 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  })

  mainWindow = window

  const load = () => {
    if (process.env.VITE_DEV_SERVER_URL) {
      void window.loadURL(process.env.VITE_DEV_SERVER_URL)
    } else {
      void window.loadFile(path.join(__dirname, '../../dist/index.html'))
    }
  }

  window.once('ready-to-show', () => {
    window.show()
    sendWindowState()
  })

  window.on('maximize', sendWindowState)
  window.on('unmaximize', sendWindowState)
  window.on('enter-full-screen', sendWindowState)
  window.on('leave-full-screen', sendWindowState)
  window.on('focus', sendWindowState)
  window.on('blur', sendWindowState)

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    const current = window.webContents.getURL()
    if (url !== current) event.preventDefault()
  })

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveWindowBounds(window), 350)
  }
  window.on('resize', scheduleSave)
  window.on('move', scheduleSave)
  window.on('close', () => saveWindowBounds(window))

  window.on('closed', () => {
    for (const controller of activeRequests.values()) controller.abort()
    activeRequests.clear()
    mainWindow = null
  })

  load()
}

function registerIpc(): void {
  ipcMain.handle('config:load', () => loadConfig())

  ipcMain.handle('config:save', (_event, input: AppConfig) => {
    const saved = saveConfig(input)
    applyTheme(saved.settings.theme)
    return saved
  })

  ipcMain.handle('secrets:has', (_event, profileId: string) => Boolean(getApiKey(profileId)))

  ipcMain.handle('secrets:clear', (_event, profileId: string) => {
    clearApiKey(profileId)
  })

  ipcMain.handle('models:fetch', async (_event: IpcMainInvokeEvent, profileId: string) => {
    const config = loadConfig()
    const profile = config.profiles.find(candidate => candidate.id === profileId)
    if (!profile) throw new Error('服务配置不存在')
    return fetchModels(profile, getApiKey(profileId))
  })

  ipcMain.handle('chat:start', (event, request: ChatRequest) => {
    const config = loadConfig()
    const profile = config.profiles.find(candidate => candidate.id === request.profileId)
    if (!profile) throw new Error('服务配置不存在')
    if (!request.requestId) throw new Error('请求标识缺失')
    if (activeRequests.has(request.requestId)) throw new Error('同一请求已在运行')

    const controller = new AbortController()
    activeRequests.set(request.requestId, controller)
    requestConversations.set(request.requestId, request.conversationId ?? '')
    const sender = event.sender
    const emit: ChatEmitter = (payload) => {
      if (sender.isDestroyed()) return
      sender.send('chat:event', { requestId: request.requestId, ...payload })
    }

    const injectionActive = request.injectionEntries?.some(entry => entry.enabled && entry.content.trim())
    const run = !injectionActive && (request.harnessToolsEnabled ?? true) ? streamHarness : streamChat
    const completion = run(profile, getApiKey(profile.id), request, emit, controller.signal, {
      requestApproval: (callId) => waitForInteraction(pendingApprovals, `${request.requestId}:${callId}`, controller.signal),
      requestAskUser: (callId) => waitForInteraction(pendingQuestions, `${request.requestId}:${callId}`, controller.signal),
    })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          emit({ type: 'stopped' })
          return
        }
        const message = error instanceof Error ? error.message : String(error)
        emit({ type: 'error', message })
      })
      .finally(() => {
        activeRequests.delete(request.requestId)
        requestConversations.delete(request.requestId)
        requestCompletions.delete(request.requestId)
      })
    requestCompletions.set(request.requestId, completion)

    return { ok: true }
  })

  ipcMain.handle('chat:stop', async (_event, requestId: string) => {
    activeRequests.get(requestId)?.abort()
    await requestCompletions.get(requestId)
  })

  ipcMain.handle('chat:approveTool', (_event, requestId: string, callId: string, decision: 'allow_once' | 'always_allow' | 'deny') => {
    const key = `${requestId}:${callId}`
    const resolver = pendingApprovals.get(key)
    if (resolver) {
      pendingApprovals.delete(key)
      resolver(decision)
    }
  })

  ipcMain.handle('chat:answerQuestion', (_event, requestId: string, callId: string, answers: Record<string, string>) => {
    const key = `${requestId}:${callId}`
    const resolver = pendingQuestions.get(key)
    if (resolver) {
      pendingQuestions.delete(key)
      resolver(answers)
    }
  })

  ipcMain.handle('workspace:pickDirectory', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择工作区目录',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0]
  })

  ipcMain.handle('workspace:installSkillFromUrl', async (_event, url: string) => {
    return installSkillFromUrl(url, path.join(appDataDir(), 'skills'))
  })

  ipcMain.handle('conversations:load', () => loadConversations())

  ipcMain.handle('conversations:save', async (_event, conversations: import('../shared/types').Conversation[]) => {
    const retained = new Set(conversations.map(conversation => conversation.id))
    const deleted = loadConversations().filter(conversation => !retained.has(conversation.id))
    saveConversations(conversations)
    for (const conversation of deleted) {
      if (!/^[\w-]+$/.test(conversation.id)) continue
      for (const [requestId, conversationId] of requestConversations) {
        if (conversationId !== conversation.id) continue
        activeRequests.get(requestId)?.abort()
        await requestCompletions.get(requestId)
      }
      if (!loadConversations().some(current => current.id === conversation.id)) {
        fs.rmSync(path.join(appDataDir(), 'runtime', conversation.id), { recursive: true, force: true })
      }
    }
  })

  ipcMain.handle('attachments:save', (_event, input: SaveAttachmentInput) => {
    return saveAttachment(input)
  })

  ipcMain.handle('images:generate', async (_event, request: ImageRequest) => {
    const config = loadConfig()
    const profile = config.profiles.find(candidate => candidate.id === request.profileId)
    if (!profile) throw new Error('图片服务配置不存在，请重新选择服务')
    return generateImage(profile, getApiKey(profile.id), request)
  })

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    harnessVersion: SDK_VERSION,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    dataDir: appDataDir(),
    defaultWorkspaceDir: os.homedir(),
  }))

  ipcMain.handle('app:setTheme', (_event, theme: ThemeMode) => {
    applyTheme(theme)
  })

  ipcMain.handle('window:state', () => ({
    fullscreen: mainWindow?.isFullScreen() ?? false,
    maximized: mainWindow?.isMaximized() ?? false,
  }))

  ipcMain.handle('app:openExternal', async (_event, url: string) => {
    if (!/^https?:\/\//i.test(url)) throw new Error('只允许打开 HTTP(S) 链接')
    await shell.openExternal(url)
  })

  ipcMain.handle('app:openDataDir', async () => {
    await shell.openPath(appDataDir())
  })

  ipcMain.handle('app:showItemInFolder', (_event, target: string) => {
    shell.showItemInFolder(target)
  })

  ipcMain.handle('app:exportArtifact', async (_event, artifact: import('../shared/types').ArtifactItem) => {
    const extension = ({ html: 'html', svg: 'svg', mermaid: 'mmd', markdown: 'md', diff: 'diff', code: 'txt' } as const)[artifact.kind] || 'txt'
    const title = (artifact.title || 'Aster').replace(/[\x00-\x1f/\\:]/g, '-').slice(0, 120)
    const result = await dialog.showSaveDialog({ title: '保存产物', defaultPath: artifact.filename ? path.basename(artifact.filename) : `${title}.${extension}` })
    if (result.canceled || !result.filePath) return null
    fs.writeFileSync(result.filePath, artifact.content, 'utf8')
    return result.filePath
  })
}

function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: '显示',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: '窗口',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(() => {
  applyTheme(loadConfig().settings.theme)
  createMenu()
  registerIpc()

  protocol.handle('aster-media', async (request) => {
    try {
      const url = new URL(request.url)
      if (url.hostname !== 'media') return new Response('Forbidden', { status: 403 })
      const id = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      if (!id || id.includes('/') || id.includes('..')) {
        return new Response('Forbidden', { status: 403 })
      }
      const file = attachmentPath(id)
      if (!fs.existsSync(file)) return new Response('Not found', { status: 404 })
      const bytes = fs.readFileSync(file)
      return new Response(bytes, {
        status: 200,
        headers: {
          'content-type': readAttachmentMime(id),
          'cache-control': 'private, max-age=31536000, immutable',
        },
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  // Ensure the user data directories exist before the renderer asks for them.
  appDataDir()
  attachmentsDir()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  for (const controller of activeRequests.values()) controller.abort()
  activeRequests.clear()
})

// Avoid leaking remote pages into the app frame.
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
})

