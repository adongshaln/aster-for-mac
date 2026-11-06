export type ApiFormat = 'openai' | 'anthropic'
export type ThemeMode = 'light' | 'dark' | 'system'
export type ImageApiMode = 'auto' | 'openai' | 'gemini'
export type MessageStatus = 'complete' | 'streaming' | 'stopped' | 'error'
export type MessageRole = 'user' | 'assistant'
export type PermissionMode = 'auto' | 'ask-destructive' | 'plan-only'
export type BillingCurrency = 'CNY' | 'USD' | 'OFF'

export interface ModelInfo {
  id: string
  ownedBy?: string
}

export interface Profile {
  id: string
  name: string
  baseUrl: string
  apiFormat: ApiFormat
  modelsPath: string
  chatPath: string
  responsesPath: string
  messagesPath: string
  imagePath: string
  imageEditPath: string
  imageApiMode: ImageApiMode
  extraHeaders: string
  chatModel: string
  reasoningEffort: string
  contextLimit: number
  webSearchEnabled?: boolean
  harnessToolsEnabled?: boolean
  models: ModelInfo[]
  hasKey: boolean
  /** Write-only from the renderer. Never returned by the main process. */
  apiKey?: string
  clearApiKey?: boolean
  lastLatencyMs?: number | null
}

export type InjectionRole = 'system' | 'user' | 'assistant'
export type InjectionPosition = 'before_history' | 'after_history' | 'in_chat'

export interface PromptInjectionEntry {
  id: string
  name: string
  description?: string
  role: InjectionRole
  position: InjectionPosition
  depth?: number
  content: string
  enabled: boolean
}

export interface PromptInjectionPreset {
  id: string
  name: string
  description: string
  builtIn?: boolean
  /** When true, suppresses default Aster assistant system prompt & tool definitions (SillyTavern pure mode). */
  pureMode?: boolean
  /** When true, applies zero-width character obfuscation on sensitive trigger words before sending. */
  zeroWidthObfuscation?: boolean
  temperature?: number
  topP?: number
  maxTokens?: number
  entries: PromptInjectionEntry[]
}

export interface InstalledSkill {
  id: string
  name: string
  description: string
  sourceUrl: string
  content: string
  enabled: boolean
  installedAt: number
  localPath?: string
}

export interface AppSettings {
  theme: ThemeMode
  systemPrompt: string
  userName: string
  enterToSend: boolean
  autoCollapseThinking: boolean
  showTokenUsage: boolean
  onboardingDone: boolean
  workspaceDir?: string
  permissionMode?: PermissionMode
  billingCurrency?: BillingCurrency
  webSearchEnabled?: boolean
  harnessToolsEnabled?: boolean
  skills?: InstalledSkill[]
  promptInjectionEnabled?: boolean
  activeInjectionPresetId?: string
  injectionPresets?: PromptInjectionPreset[]
}

export interface AppConfig {
  version: number
  profiles: Profile[]
  activeProfileId: string
  settings: AppSettings
}

export interface Attachment {
  id: string
  name: string
  mimeType: string
  size: number
  width: number
  height: number
  url: string
}

export interface MessageUsage {
  inputTokens: number
  cachedTokens: number
  cacheWriteTokens: number
  outputTokens: number
  reasoningTokens: number
  totalTokens: number
  timeToFirstTokenMs?: number | null
  durationMs?: number | null
}

export interface ChatCitation {
  title: string
  url: string
  siteName?: string
  publishedDate?: string
}

export type ToolActivityStatus = 'running' | 'completed' | 'failed' | 'pending_approval'

export interface ToolActivity {
  id: string
  name: string
  label: string
  status: ToolActivityStatus
  input?: Record<string, unknown>
  output?: string
  diff?: {
    filename: string
    oldText: string
    newText: string
  }
  durationMs?: number
}

export interface TodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

export interface AskUserQuestionItem {
  id: string
  header?: string
  question: string
  options?: { label: string; description?: string }[]
}

export interface ArtifactItem {
  id: string
  title: string
  kind: 'html' | 'svg' | 'mermaid' | 'code' | 'diff' | 'markdown'
  language?: string
  content: string
  filename?: string
  oldText?: string
  newText?: string
}

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  reasoning: string
  createdAt: number
  model: string
  profileId: string
  status: MessageStatus
  error?: string
  attachments: Attachment[]
  usage?: MessageUsage
  durationMs?: number
  reasoningDurationMs?: number
  stopped?: boolean
  continuation?: boolean
  citations?: ChatCitation[]
  toolActivities?: ToolActivity[]
  todos?: TodoItem[]
  artifacts?: ArtifactItem[]
}

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  profileId: string
  model: string
  pinned: boolean
  archived: boolean
  workspaceDir?: string
  todos?: TodoItem[]
  messages: ChatMessage[]
}

export interface ChatTurn {
  role: MessageRole
  content: string
  attachmentIds?: string[]
}

export interface ChatRequest {
  conversationId?: string
  requestId: string
  profileId: string
  model: string
  systemPrompt: string
  messages: ChatTurn[]
  effort: string
  contextLimit: number
  workspaceDir?: string
  webSearchEnabled?: boolean
  harnessToolsEnabled?: boolean
  permissionMode?: PermissionMode
  activeSkills?: InstalledSkill[]
  injectionEntries?: PromptInjectionEntry[]
  injectionPureMode?: boolean
  injectionZeroWidth?: boolean
  injectionTemperature?: number
  injectionTopP?: number
  injectionMaxTokens?: number
}

export type ChatEvent =
  | { requestId: string; type: 'delta'; text: string }
  | { requestId: string; type: 'reasoning'; text: string }
  | { requestId: string; type: 'usage'; usage: MessageUsage }
  | { requestId: string; type: 'status'; message: string }
  | { requestId: string; type: 'tool'; activity: ToolActivity }
  | { requestId: string; type: 'citations'; citations: ChatCitation[] }
  | { requestId: string; type: 'todos'; todos: TodoItem[] }
  | { requestId: string; type: 'artifact'; artifact: ArtifactItem }
  | { requestId: string; type: 'ask_user'; callId: string; questions: AskUserQuestionItem[] }
  | { requestId: string; type: 'tool_approval'; callId: string; activity: ToolActivity }
  | { requestId: string; type: 'done'; usage: MessageUsage; durationMs: number }
  | { requestId: string; type: 'error'; message: string }
  | { requestId: string; type: 'stopped' }

export interface ModelFetchResult {
  models: ModelInfo[]
  latencyMs: number
  endpoint: string
}

export interface ImageRequest {
  profileId: string
  prompt: string
  model: string
  size: string
}

export interface ImageResult {
  images: Attachment[]
  latencyMs: number
  endpoint: string
  mode: Exclude<ImageApiMode, 'auto'>
}

export interface SaveAttachmentInput {
  name: string
  mimeType: string
  base64: string
  width?: number
  height?: number
}

export interface AttachmentResult {
  attachment: Attachment
}

export interface WindowState {
  fullscreen: boolean
  maximized: boolean
}

export interface AppInfo {
  version: string
  harnessVersion?: string
  electron: string
  chrome: string
  dataDir: string
  defaultWorkspaceDir?: string
}

export interface AsterApi {
  config: {
    load(): Promise<AppConfig>
    save(config: AppConfig): Promise<AppConfig>
  }
  secrets: {
    has(profileId: string): Promise<boolean>
    clear(profileId: string): Promise<void>
  }
  models: {
    fetch(profileId: string): Promise<ModelFetchResult>
  }
  chat: {
    start(request: ChatRequest): Promise<{ ok: boolean }>
    stop(requestId: string): Promise<void>
    answerQuestion(requestId: string, callId: string, answers: Record<string, string>): Promise<void>
    approveTool(requestId: string, callId: string, decision: 'allow_once' | 'always_allow' | 'deny'): Promise<void>
    onEvent(listener: (event: ChatEvent) => void): () => void
  }
  conversations: {
    load(): Promise<Conversation[]>
    save(conversations: Conversation[]): Promise<void>
  }
  attachments: {
    save(input: SaveAttachmentInput): Promise<Attachment>
  }
  images: {
    generate(request: ImageRequest): Promise<ImageResult>
  }
  workspace: {
    pickDirectory(): Promise<string | null>
    installSkillFromUrl(url: string): Promise<InstalledSkill>
  }
  app: {
    info(): Promise<AppInfo>
    setTheme(theme: ThemeMode): Promise<void>
    windowState(): Promise<WindowState>
    onWindowState(listener: (state: WindowState) => void): () => void
    openExternal(url: string): Promise<void>
    openDataDir(): Promise<void>
    showItemInFolder(path: string): Promise<void>
    exportArtifact(artifact: ArtifactItem): Promise<string | null>
  }
}
