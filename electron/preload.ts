import { contextBridge, ipcRenderer } from 'electron'
import type { AppConfig, AsterApi, ChatEvent, ChatRequest, ImageRequest, SaveAttachmentInput, ThemeMode } from '../shared/types'

const api: AsterApi = {
  config: {
    load: () => ipcRenderer.invoke('config:load'),
    save: (config: AppConfig) => ipcRenderer.invoke('config:save', config),
  },
  secrets: {
    has: (profileId: string) => ipcRenderer.invoke('secrets:has', profileId),
    clear: (profileId: string) => ipcRenderer.invoke('secrets:clear', profileId),
  },
  models: {
    fetch: (profileId: string) => ipcRenderer.invoke('models:fetch', profileId),
  },
  chat: {
    start: (request: ChatRequest) => ipcRenderer.invoke('chat:start', request),
    stop: (requestId: string) => ipcRenderer.invoke('chat:stop', requestId),
    answerQuestion: (requestId: string, callId: string, answers: Record<string, string>) =>
      ipcRenderer.invoke('chat:answerQuestion', requestId, callId, answers),
    approveTool: (requestId: string, callId: string, decision: 'allow_once' | 'always_allow' | 'deny') =>
      ipcRenderer.invoke('chat:approveTool', requestId, callId, decision),
    onEvent: (listener: (event: ChatEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: ChatEvent) => listener(payload)
      ipcRenderer.on('chat:event', handler)
      return () => ipcRenderer.removeListener('chat:event', handler)
    },
  },
  workspace: {
    pickDirectory: () => ipcRenderer.invoke('workspace:pickDirectory'),
    installSkillFromUrl: (url: string) => ipcRenderer.invoke('workspace:installSkillFromUrl', url),
  },
  conversations: {
    load: () => ipcRenderer.invoke('conversations:load'),
    save: (conversations) => ipcRenderer.invoke('conversations:save', conversations),
  },
  attachments: {
    save: (input: SaveAttachmentInput) => ipcRenderer.invoke('attachments:save', input),
  },
  images: {
    generate: (request: ImageRequest) => ipcRenderer.invoke('images:generate', request),
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    setTheme: (theme: ThemeMode) => ipcRenderer.invoke('app:setTheme', theme),
    windowState: () => ipcRenderer.invoke('window:state'),
    onWindowState: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, state: { fullscreen: boolean; maximized: boolean }) => listener(state)
      ipcRenderer.on('window:state', handler)
      return () => ipcRenderer.removeListener('window:state', handler)
    },
    openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
    openDataDir: () => ipcRenderer.invoke('app:openDataDir'),
    showItemInFolder: (target: string) => ipcRenderer.invoke('app:showItemInFolder', target),
  },
}

contextBridge.exposeInMainWorld('aster', api)
