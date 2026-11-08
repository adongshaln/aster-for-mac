import { create } from 'zustand'
import type {
  AppConfig,
  AppInfo,
  ArtifactItem,
  AskUserQuestionItem,
  Attachment,
  ChatEvent,
  ChatMessage,
  ChatTurn,
  Conversation,
  InstalledSkill,
  MessageUsage,
  PermissionMode,
  Profile,
  PromptInjectionEntry,
  PromptInjectionPreset,
  ThemeMode,
  ToolActivity,
} from '@shared/types'
import { defaultInjectionPresets, NY_GEMINI_DEMO_PRESET_ID } from '@shared/presets'
import { normalizeEffort } from '@shared/reasoning'
import { estimateHistoryTokens, truncateTitle, uid } from '@/lib/utils'

export type SettingsSection = 'general' | 'services' | 'injections' | 'tools' | 'appearance' | 'about'

export interface PendingApprovalPrompt {
  requestId: string
  callId: string
  activity: ToolActivity
}

export interface PendingUserQuestionPrompt {
  requestId: string
  callId: string
  questions: AskUserQuestionItem[]
  answers: Record<string, string>
}

interface ActiveRequest {
  requestId: string
  conversationId: string
  messageId: string
  startedAt: number
  reasoningStartedAt?: number
}

interface Toast {
  id: string
  message: string
  kind: 'info' | 'error' | 'success'
}

interface AppState {
  ready: boolean
  initError: string
  config: AppConfig | null
  conversations: Conversation[]
  activeId: string | null
  activeRequest: ActiveRequest | null
  settingsOpen: boolean
  settingsSection: SettingsSection
  usageOpen: boolean
  imageOpen: boolean
  imageExportOpen: boolean
  imageExportMessageId: string | null
  sidebarCollapsed: boolean
  windowFullscreen: boolean
  appInfo: AppInfo | null
  toast: Toast | null
  searchFocusNonce: number
  composerQuote: string
  activeArtifact: ArtifactItem | null
  pendingApproval: PendingApprovalPrompt | null
  pendingQuestion: PendingUserQuestionPrompt | null

  init(): Promise<void>
  saveConfig(next: AppConfig): Promise<AppConfig>
  chooseModel(model: string): Promise<void>
  chooseEffort(effort: string): Promise<void>
  setActiveProfile(profileId: string): Promise<void>
  setConversationProfile(profileId: string): void
  setTheme(theme: ThemeMode): Promise<void>
  updateSettings(partial: Partial<AppConfig['settings']>): Promise<void>
  pickWorkspaceDirectory(): Promise<void>
  setPermissionMode(mode: PermissionMode): Promise<void>
  toggleWebSearch(): Promise<void>
  toggleHarnessTools(): Promise<void>
  togglePromptInjection(): Promise<void>
  setActiveInjectionPreset(presetId: string): Promise<void>
  toggleInjectionEntry(presetId: string, entryId: string): Promise<void>
  saveInjectionPresets(presets: PromptInjectionPreset[], activeId?: string): Promise<void>
  resetBuiltInInjectionPreset(): Promise<void>
  installSkill(url: string): Promise<InstalledSkill>
  toggleSkill(skillId: string): Promise<void>
  removeSkill(skillId: string): Promise<void>
  setComposerQuote(quote: string): void
  setActiveArtifact(artifact: ArtifactItem | null): void
  resolveToolApproval(decision: 'allow_once' | 'always_allow' | 'deny'): Promise<void>
  resolveUserQuestion(answers: Record<string, string>): Promise<void>
  createConversation(): string
  selectConversation(id: string): void
  deleteConversation(id: string): void
  togglePin(id: string): void
  renameConversation(id: string, title: string): void
  sendMessage(text: string, attachments: Attachment[]): Promise<void>
  stopGeneration(): Promise<void>
  regenerateLast(): Promise<void>
  continueLast(): Promise<void>
  openSettings(section?: SettingsSection): void
  closeSettings(): void
  openUsage(): void
  closeUsage(): void
  openImage(): void
  closeImage(): void
  openImageExport(messageId?: string): void
  closeImageExport(): void
  generateImage(prompt: string, model: string, size: string): Promise<number>
  toggleSidebar(): void
  focusSearch(): void
  showToast(message: string, kind?: Toast['kind']): void
  dismissToast(): void
}

let chatUnsubscribe: (() => void) | null = null
let persistTimer: ReturnType<typeof setTimeout> | null = null
let toastTimer: ReturnType<typeof setTimeout> | null = null
let themeMedia: MediaQueryList | null = null

function applyTheme(theme: ThemeMode): void {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = theme === 'dark' || (theme === 'system' && systemDark)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.dataset.mode = dark ? 'dark' : 'light'
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  void window.aster.app.setTheme(theme)
}

function installThemeListener(): void {
  if (themeMedia) return
  themeMedia = window.matchMedia('(prefers-color-scheme: dark)')
  themeMedia.addEventListener('change', () => {
    const settings = useAppStore.getState().config?.settings
    if (settings?.theme === 'system') applyTheme('system')
  })
}

function markOrphanedStreams(conversations: Conversation[]): Conversation[] {
  return conversations.map(conversation => ({
    ...conversation,
    messages: conversation.messages.map(message => (
      message.status === 'streaming'
        ? { ...message, status: 'stopped' as const, stopped: true }
        : message
    )),
  }))
}

function profileFor(config: AppConfig | null, profileId: string): Profile | undefined {
  return config?.profiles.find(profile => profile.id === (profileId || config.activeProfileId))
}

function historyFor(conversation: Conversation, excludeId?: string, extra?: ChatTurn[]): ChatTurn[] {
  const turns: ChatTurn[] = conversation.messages
    .filter(message => message.id !== excludeId)
    .filter(message => message.status !== 'streaming')
    .filter(message => message.content.trim() || message.attachments.length)
    .map(message => ({
      role: message.role,
      content: message.content,
      attachmentIds: message.attachments.map(attachment => attachment.id),
    }))
  if (extra) turns.push(...extra)
  return turns
}

export const useAppStore = create<AppState>((set, get) => {
  const schedulePersist = (delay = 700) => {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      persistTimer = null
      const conversations = useAppStore.getState().conversations
      void window.aster.conversations.save(conversations)
    }, delay)
  }

  const persistNow = () => {
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    void window.aster.conversations.save(useAppStore.getState().conversations)
  }

  const finishRequest = (
    requestId: string,
    status: 'complete' | 'stopped' | 'error',
    options: { usage?: MessageUsage; error?: string; durationMs?: number } = {},
  ) => {
    const state = get()
    const active = state.activeRequest
    if (!active || active.requestId !== requestId) return
    const finishedAt = Date.now()
    const durationMs = options.durationMs ?? finishedAt - active.startedAt
    const reasoningDurationMs = active.reasoningStartedAt
      ? Math.max(0, finishedAt - active.reasoningStartedAt)
      : undefined
    set({
      activeRequest: null,
      conversations: state.conversations.map(conversation => (
        conversation.id !== active.conversationId
          ? conversation
          : {
              ...conversation,
              updatedAt: finishedAt,
              messages: conversation.messages.map(message => (
                message.id !== active.messageId
                  ? message
                  : {
                      ...message,
                      status,
                      error: options.error,
                      usage: options.usage ?? message.usage,
                      durationMs,
                      reasoningDurationMs,
                      stopped: status === 'stopped' ? true : message.stopped,
                    }
              )),
            }
      )),
    })
    schedulePersist(0)
  }

  const handleChatEvent = (event: ChatEvent) => {
    const state = get()
    const active = state.activeRequest
    if (!active || active.requestId !== event.requestId) return

    if (event.type === 'delta') {
      set({
        conversations: state.conversations.map(conversation => (
          conversation.id !== active.conversationId
            ? conversation
            : {
                ...conversation,
                messages: conversation.messages.map(message => (
                  message.id !== active.messageId
                    ? message
                    : { ...message, content: message.content + event.text, status: 'streaming' }
                )),
              }
        )),
      })
      schedulePersist(1500)
      return
    }

    if (event.type === 'reasoning') {
      if (!active.reasoningStartedAt) {
        set({ activeRequest: { ...active, reasoningStartedAt: Date.now() } })
      }
      set(current => ({
        conversations: current.conversations.map(conversation => (
          conversation.id !== active.conversationId
            ? conversation
            : {
                ...conversation,
                messages: conversation.messages.map(message => (
                  message.id !== active.messageId
                    ? message
                    : { ...message, reasoning: message.reasoning + event.text, status: 'streaming' }
                )),
              }
        )),
      }))
      schedulePersist(2500)
      return
    }

    if (event.type === 'usage') {
      set(current => ({
        conversations: current.conversations.map(conversation => (
          conversation.id !== active.conversationId
            ? conversation
            : {
                ...conversation,
                messages: conversation.messages.map(message => (
                  message.id !== active.messageId ? message : { ...message, usage: event.usage }
                )),
              }
        )),
      }))
      return
    }

    if (event.type === 'status') {
      get().showToast(event.message, 'info')
      return
    }

    if (event.type === 'tool') {
      set(current => ({
        conversations: current.conversations.map(conversation => (
          conversation.id !== active.conversationId
            ? conversation
            : {
                ...conversation,
                messages: conversation.messages.map(message => {
                  if (message.id !== active.messageId) return message
                  const list = [...(message.toolActivities ?? [])]
                  const idx = list.findIndex(item => item.id === event.activity.id)
                  if (idx >= 0) list[idx] = event.activity
                  else list.push(event.activity)
                  return { ...message, toolActivities: list }
                }),
              }
        )),
      }))
      schedulePersist(1200)
      return
    }

    if (event.type === 'citations') {
      set(current => ({
        conversations: current.conversations.map(conversation => (
          conversation.id !== active.conversationId
            ? conversation
            : {
                ...conversation,
                messages: conversation.messages.map(message => (
                  message.id !== active.messageId ? message : { ...message, citations: event.citations }
                )),
              }
        )),
      }))
      schedulePersist(1500)
      return
    }

    if (event.type === 'todos') {
      set(current => ({
        conversations: current.conversations.map(conversation => (
          conversation.id !== active.conversationId
            ? conversation
            : {
                ...conversation,
                todos: event.todos,
                messages: conversation.messages.map(message => (
                  message.id !== active.messageId ? message : { ...message, todos: event.todos }
                )),
              }
        )),
      }))
      schedulePersist(1200)
      return
    }

    if (event.type === 'artifact') {
      set(current => ({
        activeArtifact: event.artifact,
        conversations: current.conversations.map(conversation => (
          conversation.id !== active.conversationId
            ? conversation
            : {
                ...conversation,
                messages: conversation.messages.map(message => (
                  message.id !== active.messageId
                    ? message
                    : { ...message, artifacts: [...(message.artifacts ?? []), event.artifact] }
                )),
              }
        )),
      }))
      schedulePersist(1200)
      return
    }

    if (event.type === 'tool_approval') {
      set({
        pendingApproval: {
          requestId: event.requestId,
          callId: event.callId,
          activity: event.activity,
        },
      })
      return
    }

    if (event.type === 'ask_user') {
      set({
        pendingQuestion: {
          requestId: event.requestId,
          callId: event.callId,
          questions: event.questions,
          answers: {},
        },
      })
      return
    }

    if (event.type === 'done') {
      set({ pendingApproval: null, pendingQuestion: null })
      finishRequest(event.requestId, 'complete', { usage: event.usage, durationMs: event.durationMs })
      return
    }

    if (event.type === 'stopped') {
      set({ pendingApproval: null, pendingQuestion: null })
      finishRequest(event.requestId, 'stopped')
      return
    }

    if (event.type === 'error') {
      set({ pendingApproval: null, pendingQuestion: null })
      finishRequest(event.requestId, 'error', { error: event.message })
    }
  }

  const startChat = async (options: {
    conversation: Conversation
    assistantId: string
    turns: ChatTurn[]
    profile: Profile
    model: string
    effort: string
  }) => {
    const { conversation, assistantId, turns, profile, model, effort } = options
    const requestId = assistantId
    const startedAt = Date.now()
    set({
      activeRequest: {
        requestId,
        conversationId: conversation.id,
        messageId: assistantId,
        startedAt,
      },
      conversations: get().conversations.map(item => (
        item.id === conversation.id
          ? {
              ...item,
              updatedAt: startedAt,
              messages: [
                ...item.messages,
                {
                  id: assistantId,
                  role: 'assistant',
                  content: '',
                  reasoning: '',
                  createdAt: startedAt,
                  model,
                  profileId: profile.id,
                  status: 'streaming',
                  attachments: [],
                  continuation: options.turns[options.turns.length - 1]?.content.startsWith('[继续]'),
                },
              ],
            }
          : item
      )),
    })
    schedulePersist(0)

    try {
      const settings = get().config?.settings
      const presets = settings?.injectionPresets?.length
        ? settings.injectionPresets
        : defaultInjectionPresets()
      const activePreset =
        presets.find(p => p.id === settings?.activeInjectionPresetId) ?? presets[0]
      const injectionActive = Boolean(settings?.promptInjectionEnabled && activePreset)
      const injectionEntries: PromptInjectionEntry[] = injectionActive
        ? activePreset!.entries.filter(e => e.enabled && e.content.trim().length > 0)
        : []
      await window.aster.chat.start({
        conversationId: conversation.id,
        requestId,
        profileId: profile.id,
        model,
        systemPrompt: settings?.systemPrompt ?? '',
        messages: turns,
        effort: normalizeEffort(model, effort),
        contextLimit: profile.contextLimit || 128_000,
        workspaceDir: conversation.workspaceDir || settings?.workspaceDir,
        webSearchEnabled: settings?.webSearchEnabled ?? true,
        harnessToolsEnabled: settings?.harnessToolsEnabled ?? true,
        permissionMode: settings?.permissionMode ?? 'auto',
        activeSkills: settings?.skills ?? [],
        injectionEntries,
        injectionPureMode: injectionActive ? (activePreset?.pureMode ?? true) : false,
        injectionZeroWidth: injectionActive ? (activePreset?.zeroWidthObfuscation ?? true) : false,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      finishRequest(requestId, 'error', { error: message })
    }
  }

  return {
    ready: false,
    initError: '',
    config: null,
    conversations: [],
    activeId: null,
    activeRequest: null,
    settingsOpen: false,
    settingsSection: 'general',
    usageOpen: false,
    imageOpen: false,
    imageExportOpen: false,
    imageExportMessageId: null,
    sidebarCollapsed: false,
    windowFullscreen: false,
    appInfo: null,
    toast: null,
    searchFocusNonce: 0,
    composerQuote: '',
    activeArtifact: null,
    pendingApproval: null,
    pendingQuestion: null,

    init: async () => {
      if (get().ready) return
      try {
        const [config, conversations, appInfo, windowState] = await Promise.all([
          window.aster.config.load(),
          window.aster.conversations.load(),
          window.aster.app.info(),
          window.aster.app.windowState(),
        ])
        const cleaned = markOrphanedStreams(conversations).filter(conversation => conversation.messages.length > 0)
        const first = cleaned.find(conversation => !conversation.archived && conversation.messages.length > 0)?.id ?? null
        set({
          config,
          conversations: cleaned,
          activeId: first,
          ready: true,
          appInfo,
          windowFullscreen: windowState.fullscreen,
        })
        applyTheme(config.settings.theme)
        installThemeListener()
        if (!chatUnsubscribe) chatUnsubscribe = window.aster.chat.onEvent(handleChatEvent)
        void window.aster.app.onWindowState(state => set({ windowFullscreen: state.fullscreen }))
        if (JSON.stringify(cleaned) !== JSON.stringify(conversations)) schedulePersist(0)
      } catch (error) {
        set({
          ready: true,
          initError: error instanceof Error ? error.message : String(error),
        })
      }
    },

    saveConfig: async next => {
      const saved = await window.aster.config.save(next)
      set({ config: saved })
      applyTheme(saved.settings.theme)
      return saved
    },

    chooseModel: async model => {
      const state = get()
      if (!state.config) return
      const profileId = state.conversations.find(item => item.id === state.activeId)?.profileId
        ?? state.config.activeProfileId
      const profiles = state.config.profiles.map(profile => (
        profile.id === profileId
          ? { ...profile, chatModel: model, reasoningEffort: normalizeEffort(model, profile.reasoningEffort) }
          : profile
      ))
      const config = { ...state.config, profiles }
      set({
        config,
        conversations: state.conversations.map(conversation => (
          conversation.id === state.activeId ? { ...conversation, model } : conversation
        )),
      })
      await get().saveConfig(config)
      schedulePersist(200)
    },

    chooseEffort: async effort => {
      const state = get()
      if (!state.config) return
      const profileId = state.conversations.find(item => item.id === state.activeId)?.profileId
        ?? state.config.activeProfileId
      const profiles = state.config.profiles.map(profile => (
        profile.id === profileId ? { ...profile, reasoningEffort: effort } : profile
      ))
      await get().saveConfig({ ...state.config, profiles })
    },

    setActiveProfile: async profileId => {
      const state = get()
      if (!state.config) return
      const profile = state.config.profiles.find(item => item.id === profileId)
      if (!profile) return
      const config = {
        ...state.config,
        activeProfileId: profileId,
        profiles: state.config.profiles.map(item => (
          item.id === profileId
            ? { ...item, reasoningEffort: normalizeEffort(item.chatModel, item.reasoningEffort) }
            : item
        )),
      }
      set({ config })
      await get().saveConfig(config)
    },

    setConversationProfile: profileId => {
      const state = get()
      const profile = state.config?.profiles.find(item => item.id === profileId)
      if (!profile || !state.activeId) return
      if (state.activeRequest?.conversationId === state.activeId) {
        state.showToast('请先停止当前生成再切换服务', 'info')
        return
      }
      set({ conversations: state.conversations.map(conversation => conversation.id === state.activeId
        ? { ...conversation, profileId, model: profile.chatModel || profile.models[0]?.id || '' }
        : conversation) })
      schedulePersist(0)
      state.showToast(`此对话已改用 ${profile.name}`, 'success')
    },

    setTheme: async theme => {
      const state = get()
      if (!state.config) return
      const config = { ...state.config, settings: { ...state.config.settings, theme } }
      set({ config })
      applyTheme(theme)
      await get().saveConfig(config)
    },

    updateSettings: async partial => {
      const state = get()
      if (!state.config) return
      const config = { ...state.config, settings: { ...state.config.settings, ...partial } }
      set({ config })
      await get().saveConfig(config)
    },

    pickWorkspaceDirectory: async () => {
      const picked = await window.aster.workspace.pickDirectory()
      if (!picked) return
      await get().updateSettings({ workspaceDir: picked })
      const activeId = get().activeId
      if (activeId) {
        set(state => ({
          conversations: state.conversations.map(c => (c.id === activeId ? { ...c, workspaceDir: picked } : c)),
        }))
        schedulePersist(100)
      }
      get().showToast(`工作区已切换至 ${picked.split('/').pop() || picked}`, 'success')
    },

    setPermissionMode: async mode => {
      await get().updateSettings({ permissionMode: mode })
    },

    toggleWebSearch: async () => {
      const current = get().config?.settings.webSearchEnabled ?? true
      await get().updateSettings({ webSearchEnabled: !current })
    },

    toggleHarnessTools: async () => {
      const current = get().config?.settings.harnessToolsEnabled ?? true
      await get().updateSettings({ harnessToolsEnabled: !current })
    },

    togglePromptInjection: async () => {
      const current = get().config?.settings.promptInjectionEnabled ?? false
      await get().updateSettings({ promptInjectionEnabled: !current })
    },

    setActiveInjectionPreset: async presetId => {
      await get().updateSettings({ activeInjectionPresetId: presetId, promptInjectionEnabled: true })
    },

    toggleInjectionEntry: async (presetId, entryId) => {
      const settings = get().config?.settings
      const presets = settings?.injectionPresets?.length
        ? settings.injectionPresets
        : defaultInjectionPresets()
      const updated = presets.map(p =>
        p.id !== presetId
          ? p
          : {
              ...p,
              entries: p.entries.map(e => (e.id === entryId ? { ...e, enabled: !e.enabled } : e)),
            },
      )
      await get().updateSettings({ injectionPresets: updated })
    },

    saveInjectionPresets: async (presets, activeId) => {
      const settings = get().config?.settings
      const nextActive =
        activeId ??
        (presets.some(p => p.id === settings?.activeInjectionPresetId)
          ? settings?.activeInjectionPresetId
          : presets[0]?.id ?? NY_GEMINI_DEMO_PRESET_ID)
      await get().updateSettings({
        injectionPresets: presets,
        activeInjectionPresetId: nextActive,
      })
    },

    resetBuiltInInjectionPreset: async () => {
      const settings = get().config?.settings
      const builtIn = defaultInjectionPresets()[0]
      const others = (settings?.injectionPresets ?? []).filter(p => p.id !== builtIn.id)
      await get().updateSettings({
        injectionPresets: [builtIn, ...others],
        activeInjectionPresetId: builtIn.id,
      })
      get().showToast('已重置 Ny-Gemini 越狱演示预设为默认状态', 'success')
    },

    installSkill: async url => {
      const skill = await window.aster.workspace.installSkillFromUrl(url)
      const existing = get().config?.settings.skills ?? []
      const filtered = existing.filter(s => s.name !== skill.name && s.sourceUrl !== skill.sourceUrl)
      await get().updateSettings({ skills: [skill, ...filtered] })
      get().showToast(`已安装技能：${skill.name}`, 'success')
      return skill
    },

    toggleSkill: async skillId => {
      const existing = get().config?.settings.skills ?? []
      await get().updateSettings({
        skills: existing.map(s => (s.id === skillId ? { ...s, enabled: !s.enabled } : s)),
      })
    },

    removeSkill: async skillId => {
      const existing = get().config?.settings.skills ?? []
      await get().updateSettings({
        skills: existing.filter(s => s.id !== skillId),
      })
    },

    setComposerQuote: quote => set({ composerQuote: quote }),
    setActiveArtifact: artifact => set({ activeArtifact: artifact }),

    resolveToolApproval: async decision => {
      const pending = get().pendingApproval
      if (!pending) return
      set({ pendingApproval: null })
      await window.aster.chat.approveTool(pending.requestId, pending.callId, decision)
    },

    resolveUserQuestion: async answers => {
      const pending = get().pendingQuestion
      if (!pending) return
      const merged = { ...pending.answers }
      for (const question of pending.questions) {
        if (answers[question.id]?.trim()) merged[question.id] = answers[question.id].trim()
      }
      if (!pending.questions.every(question => merged[question.id])) {
        set({ pendingQuestion: { ...pending, answers: merged } })
        return
      }
      set({ pendingQuestion: null })
      await window.aster.chat.answerQuestion(pending.requestId, pending.callId, merged)
    },

    createConversation: () => {
      const state = get()
      const current = state.conversations.find(conversation => conversation.id === state.activeId)
      if (current && current.messages.length === 0) return current.id
      const profile = profileFor(state.config, state.config?.activeProfileId ?? '')
      const model = profile?.chatModel || profile?.models[0]?.id || ''
      const conversation: Conversation = {
        id: uid(),
        title: '新对话',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        profileId: profile?.id ?? '',
        model,
        pinned: false,
        archived: false,
        messages: [],
      }
      set({
        conversations: [conversation, ...state.conversations],
        activeId: conversation.id,
      })
      schedulePersist(0)
      return conversation.id
    },

    selectConversation: id => {
      set({ activeId: id })
    },

    deleteConversation: id => {
      const state = get()
      if (state.activeRequest?.conversationId === id) {
        state.stopGeneration()
      }
      const conversations = state.conversations.filter(conversation => conversation.id !== id)
      set({
        conversations,
        activeId: state.activeId === id ? (conversations[0]?.id ?? null) : state.activeId,
      })
      schedulePersist(0)
    },

    togglePin: id => {
      set(state => ({
        conversations: state.conversations.map(conversation => (
          conversation.id === id ? { ...conversation, pinned: !conversation.pinned } : conversation
        )),
      }))
      schedulePersist(0)
    },

    renameConversation: (id, title) => {
      const next = title.trim()
      if (!next) return
      set(state => ({
        conversations: state.conversations.map(conversation => (
          conversation.id === id ? { ...conversation, title: next } : conversation
        )),
      }))
      schedulePersist(0)
    },

    sendMessage: async (text, attachments) => {
      const state = get()
      if (state.activeRequest) {
        get().showToast('请先停止当前生成', 'info')
        return
      }
      const trimmed = text.trim()
      if (!trimmed && !attachments.length) return

      let conversationId = state.activeId
      if (!conversationId) conversationId = get().createConversation()
      let conversation = get().conversations.find(item => item.id === conversationId)
      if (!conversation) {
        get().showToast('会话不存在', 'error')
        return
      }
      const profile = profileFor(get().config, conversation.profileId)
      if (!profile) {
        get().openSettings('services')
        get().showToast('会话对应的服务不存在，请在模型服务设置中为此对话选择服务', 'error')
        return
      }
      const model = conversation.model || profile.chatModel || profile.models[0]?.id || ''
      if (!model) {
        get().openSettings('services')
        get().showToast('请先为该服务选择模型', 'error')
        return
      }

      const now = Date.now()
      const userMessage: ChatMessage = {
        id: uid(),
        role: 'user',
        content: trimmed,
        reasoning: '',
        createdAt: now,
        model,
        profileId: profile.id,
        status: 'complete',
        attachments,
      }
      const assistantId = uid()
      const title = conversation.title === '新对话' && trimmed
        ? truncateTitle(trimmed)
        : conversation.title
      conversation = {
        ...conversation,
        title,
        model,
        profileId: profile.id,
        updatedAt: now,
        messages: [...conversation.messages, userMessage],
      }
      set(current => ({
        conversations: current.conversations.map(item => (
          item.id === conversationId ? conversation! : item
        )),
        activeId: conversationId,
      }))
      schedulePersist(0)

      const turns = historyFor(conversation, assistantId)
      await startChat({
        conversation,
        assistantId,
        turns,
        profile,
        model,
        effort: profile.reasoningEffort,
      })
    },

    stopGeneration: async () => {
      const active = get().activeRequest
      if (!active) return
      set({ pendingApproval: null, pendingQuestion: null })
      await window.aster.chat.stop(active.requestId)
      finishRequest(active.requestId, 'stopped')
    },

    regenerateLast: async () => {
      const state = get()
      if (state.activeRequest) {
        await state.stopGeneration()
      }
      const current = get()
      const conversation = current.conversations.find(item => item.id === current.activeId)
      if (!conversation) return
      const lastAssistantIndex = [...conversation.messages]
        .map((message, index) => ({ message, index }))
        .filter(item => item.message.role === 'assistant')
        .pop()?.index
      if (lastAssistantIndex == null) return
      const lastUser = [...conversation.messages.slice(0, lastAssistantIndex)]
        .reverse()
        .find(message => message.role === 'user')
      if (!lastUser) return
      const trimmedMessages = conversation.messages.slice(0, lastAssistantIndex)
      const profile = profileFor(get().config, conversation.profileId)
      if (!profile) return
      const model = conversation.model || profile.chatModel
      if (!model) return
      const nextConversation: Conversation = {
        ...conversation,
        messages: trimmedMessages,
        model,
        updatedAt: Date.now(),
      }
      set(current => ({
        conversations: current.conversations.map(item => (
          item.id === nextConversation.id ? nextConversation : item
        )),
      }))
      await startChat({
        conversation: nextConversation,
        assistantId: uid(),
        turns: historyFor(nextConversation),
        profile,
        model,
        effort: profile.reasoningEffort,
      })
    },

    continueLast: async () => {
      const state = get()
      if (state.activeRequest) return
      const conversation = state.conversations.find(item => item.id === state.activeId)
      if (!conversation) return
      const last = conversation.messages[conversation.messages.length - 1]
      if (!last || last.role !== 'assistant') return
      const profile = profileFor(state.config, conversation.profileId)
      if (!profile) return
      const model = conversation.model || profile.chatModel
      if (!model) return
      const turns: ChatTurn[] = [
        ...historyFor(conversation),
        {
          role: 'user',
          content: '[继续] 请从中断处自然继续上一条回答，不要重复已经输出的内容。',
        },
      ]
      await startChat({
        conversation,
        assistantId: uid(),
        turns,
        profile,
        model,
        effort: profile.reasoningEffort,
      })
    },

    openSettings: section => set({ settingsOpen: true, settingsSection: section ?? 'general', usageOpen: false, imageOpen: false, imageExportOpen: false, imageExportMessageId: null }),
    closeSettings: () => set({ settingsOpen: false }),
    openUsage: () => set({ usageOpen: true, settingsOpen: false, imageOpen: false, imageExportOpen: false, imageExportMessageId: null }),
    closeUsage: () => set({ usageOpen: false }),
    openImage: () => set({ imageOpen: true, settingsOpen: false, usageOpen: false, imageExportOpen: false, imageExportMessageId: null }),
    closeImage: () => set({ imageOpen: false }),
    openImageExport: messageId => set({ imageExportOpen: true, imageExportMessageId: messageId ?? null, settingsOpen: false, usageOpen: false, imageOpen: false }),
    closeImageExport: () => set({ imageExportOpen: false, imageExportMessageId: null }),

    generateImage: async (prompt, model, size) => {
      const state = get()
      const profile = activeProfile(state)
      if (!profile) throw new Error('请先配置模型服务')
      if (!prompt.trim()) throw new Error('请输入图片提示词')
      if (!model.trim()) throw new Error('请选择图片模型')

      let conversation = activeConversation(state)
      if (!conversation) {
        const id = get().createConversation()
        conversation = get().conversations.find(candidate => candidate.id === id)
      }
      if (!conversation) throw new Error('无法创建对话')
      const conversationId = conversation.id

      const result = await window.aster.images.generate({ profileId: profile.id, prompt: prompt.trim(), model: model.trim(), size })
      const message: ChatMessage = {
        id: uid(),
        role: 'assistant',
        content: '',
        reasoning: '',
        createdAt: Date.now(),
        model: model.trim(),
        profileId: profile.id,
        status: 'complete',
        attachments: result.images,
      }
      set(current => ({
        conversations: current.conversations.map(candidate => candidate.id === conversationId
          ? {
              ...candidate,
              title: candidate.title === '新对话' && prompt.trim() ? truncateTitle(prompt.trim(), 40) : candidate.title,
              updatedAt: Date.now(),
              messages: [...candidate.messages, message],
            }
          : candidate),
      }))
      schedulePersist(0)
      return result.images.length
    },
    toggleSidebar: () => set(state => ({ sidebarCollapsed: !state.sidebarCollapsed })),
    focusSearch: () => set(state => ({ searchFocusNonce: state.searchFocusNonce + 1 })),

    showToast: (message, kind = 'info') => {
      if (toastTimer) clearTimeout(toastTimer)
      const toast = { id: uid(), message, kind }
      set({ toast })
      toastTimer = setTimeout(() => set({ toast: null }), 3400)
    },

    dismissToast: () => {
      if (toastTimer) clearTimeout(toastTimer)
      set({ toast: null })
    },
  }
})

export function activeConversation(state: AppState): Conversation | undefined {
  return state.conversations.find(conversation => conversation.id === state.activeId)
}

export function activeProfile(state: AppState): Profile | undefined {
  const conversation = activeConversation(state)
  return profileFor(state.config, conversation?.profileId ?? '')
}

export function conversationTokens(conversation: Conversation | undefined): number {
  if (!conversation) return 0
  return estimateHistoryTokens(conversation.messages)
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistTimer = null
      void window.aster.conversations.save(useAppStore.getState().conversations)
    }
  })
}
