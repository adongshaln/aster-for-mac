import { app, safeStorage } from 'electron'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type {
  AppConfig,
  AppSettings,
  Attachment,
  Conversation,
  Profile,
  PromptInjectionPreset,
  SaveAttachmentInput,
} from '../shared/types'
import { defaultInjectionPresets, NY_GEMINI_DEMO_PRESET_ID } from '../shared/presets'

function buildDefaultPresetsWithDiskSync(): PromptInjectionPreset[] {
  const presets = defaultInjectionPresets()
  const localJsonPath = path.join(os.homedir(), 'Downloads', 'Ny-Gemini-1.4.3_SogonSigon_2.json')
  try {
    if (fs.existsSync(localJsonPath)) {
      const parsed = JSON.parse(fs.readFileSync(localJsonPath, 'utf8')) as {
        prompts?: { identifier?: string; content?: string }[]
      }
      const byId = new Map<string, string>()
      for (const p of parsed.prompts ?? []) {
        if (typeof p.identifier === 'string' && typeof p.content === 'string' && p.content.trim()) {
          byId.set(p.identifier, p.content)
        }
      }
      for (const preset of presets) {
        if (preset.id !== NY_GEMINI_DEMO_PRESET_ID) continue
        preset.entries = preset.entries.map(entry => {
          // For single-ID entries (excluding merged structural blocks), sync raw content from local JSON
          if (
            entry.id !== '39f479af-0e7a-480c-96b6-238e4efb49fd' &&
            entry.id !== 'a36bd54c-6ed9-4454-b9ee-1991bbf867a3' &&
            entry.id !== 'b9c341bb-69a4-4116-ad48-e0000e4bbae3' &&
            byId.has(entry.id)
          ) {
            return { ...entry, content: byId.get(entry.id)! }
          }
          return entry
        })
      }
    }
  } catch {
    // Fallback to built-in definitions if local file cannot be read
  }
  return presets
}

const CONFIG_FILE = 'config.json'
const CONVERSATIONS_FILE = 'conversations.json'
const SECRETS_FILE = 'secrets.json'
const ATTACHMENTS_DIR = 'attachments'

export const DEFAULT_SYSTEM_PROMPT =
  '你是 Aster 中可靠、友好的 AI 助手。请使用清晰、自然的中文回答。'

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  userName: '',
  enterToSend: true,
  autoCollapseThinking: true,
  showTokenUsage: true,
  onboardingDone: false,
  workspaceDir: os.homedir(),
  permissionMode: 'auto',
  billingCurrency: 'CNY',
  webSearchEnabled: true,
  harnessToolsEnabled: true,
  skills: [],
  promptInjectionEnabled: false,
  activeInjectionPresetId: NY_GEMINI_DEMO_PRESET_ID,
  injectionPresets: defaultInjectionPresets(),
}

export function appDataDir(): string {
  const dir = path.join(app.getPath('userData'), 'aster')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function attachmentsDir(): string {
  const dir = path.join(appDataDir(), ATTACHMENTS_DIR)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function readJson<T>(file: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(path.join(appDataDir(), file), 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(file: string, value: unknown): void {
  const dir = appDataDir()
  const target = path.join(dir, file)
  const temp = `${target}.${process.pid}.tmp`
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8')
  fs.renameSync(temp, target)
}

function readSecrets(): Record<string, string> {
  const raw = readJson<Record<string, unknown>>(SECRETS_FILE, {})
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'string') continue
    if (value.startsWith('enc:')) {
      try {
        result[key] = safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'))
      } catch {
        // A key encrypted by a different account or machine cannot be recovered.
      }
    } else if (value.startsWith('plain:')) {
      result[key] = Buffer.from(value.slice(6), 'base64').toString('utf8')
    }
  }
  return result
}

function writeSecrets(secrets: Record<string, string>): void {
  const encoded: Record<string, string> = {}
  for (const [key, value] of Object.entries(secrets)) {
    if (!value) continue
    if (safeStorage.isEncryptionAvailable()) {
      encoded[key] = `enc:${safeStorage.encryptString(value).toString('base64')}`
    } else {
      encoded[key] = `plain:${Buffer.from(value, 'utf8').toString('base64')}`
    }
  }
  writeJson(SECRETS_FILE, encoded)
}

export function getApiKey(profileId: string): string {
  return readSecrets()[profileId] ?? ''
}

function cleanPath(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || fallback
}

function normalizeProfile(input: Partial<Profile>): Profile {
  const id = typeof input.id === 'string' && input.id ? input.id : randomUUID()
  return {
    id,
    name: String(input.name ?? '').trim() || '未命名服务',
    baseUrl: String(input.baseUrl ?? '').trim().replace(/\/+$/, ''),
    apiFormat: input.apiFormat === 'anthropic' ? 'anthropic' : 'openai',
    modelsPath: cleanPath(input.modelsPath, '/v1/models'),
    chatPath: cleanPath(input.chatPath, '/v1/chat/completions'),
    responsesPath: cleanPath(input.responsesPath, '/v1/responses'),
    messagesPath: cleanPath(input.messagesPath, '/v1/messages'),
    imagePath: cleanPath(input.imagePath, '/v1/images/generations'),
    imageEditPath: cleanPath(input.imageEditPath, '/v1/images/edits'),
    imageApiMode: ['auto', 'openai', 'gemini'].includes(String(input.imageApiMode))
      ? (input.imageApiMode as Profile['imageApiMode'])
      : 'auto',
    extraHeaders: String(input.extraHeaders ?? '')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .join('\n'),
    chatModel: String(input.chatModel ?? '').trim(),
    reasoningEffort: String(input.reasoningEffort ?? 'default').trim() || 'default',
    contextLimit: Number.isFinite(Number(input.contextLimit))
      ? Math.max(4096, Math.min(4_000_000, Number(input.contextLimit)))
      : 128_000,
    webSearchEnabled: input.webSearchEnabled ?? true,
    harnessToolsEnabled: input.harnessToolsEnabled ?? true,
    models: Array.isArray(input.models)
      ? input.models
          .filter(model => model && typeof model.id === 'string' && model.id.trim())
          .map(model => ({ id: model.id.trim(), ownedBy: model.ownedBy }))
          .slice(0, 2000)
      : [],
    hasKey: false,
    lastLatencyMs: typeof input.lastLatencyMs === 'number' ? input.lastLatencyMs : null,
  }
}

export function loadConfig(): AppConfig {
  const raw = readJson<Partial<AppConfig>>(CONFIG_FILE, {})
  const secrets = readSecrets()
  const profiles = (Array.isArray(raw.profiles) ? raw.profiles : [])
    .map(profile => normalizeProfile(profile))
    .map(profile => ({ ...profile, hasKey: Boolean(secrets[profile.id]) }))
  const activeProfileId = profiles.some(profile => profile.id === raw.activeProfileId)
    ? String(raw.activeProfileId)
    : profiles[0]?.id ?? ''
  const settings = { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) }
  if (!['light', 'dark', 'system'].includes(settings.theme)) settings.theme = 'system'
  if (!Array.isArray(settings.injectionPresets) || settings.injectionPresets.length === 0) {
    settings.injectionPresets = defaultInjectionPresets()
  } else {
    const freshDemo = defaultInjectionPresets()[0]
    let migrated = false
    settings.injectionPresets = settings.injectionPresets.map(p => {
      if (
        p.id === NY_GEMINI_DEMO_PRESET_ID &&
        (p.entries.length !== freshDemo.entries.length ||
          !p.entries.some(e => e.content.includes('历史记录截断处')))
      ) {
        migrated = true
        return freshDemo
      }
      return p
    })
    if (migrated) {
      writeJson(CONFIG_FILE, {
        version: 1,
        profiles: raw.profiles ?? [],
        activeProfileId,
        settings,
      })
    }
  }
  if (!settings.activeInjectionPresetId || !settings.injectionPresets.some(p => p.id === settings.activeInjectionPresetId)) {
    settings.activeInjectionPresetId = settings.injectionPresets[0]?.id ?? NY_GEMINI_DEMO_PRESET_ID
  }
  return {
    version: 1,
    profiles,
    activeProfileId,
    settings,
  }
}

export function saveConfig(input: AppConfig): AppConfig {
  const existing = loadConfig()
  const secrets = readSecrets()
  const incoming = (Array.isArray(input.profiles) ? input.profiles : []).map(profile => normalizeProfile(profile))

  for (const profile of incoming) {
    const source = input.profiles.find(candidate => candidate.id === profile.id)
    if (source?.clearApiKey) {
      delete secrets[profile.id]
    } else if (typeof source?.apiKey === 'string' && source.apiKey.trim()) {
      secrets[profile.id] = source.apiKey.trim()
    }
  }

  const ids = new Set(incoming.map(profile => profile.id))
  for (const profile of existing.profiles) {
    if (!ids.has(profile.id)) delete secrets[profile.id]
  }

  writeSecrets(secrets)

  const activeProfileId = incoming.some(profile => profile.id === input.activeProfileId)
    ? input.activeProfileId
    : incoming[0]?.id ?? ''
  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...input.settings,
    theme: ['light', 'dark', 'system'].includes(input.settings?.theme)
      ? input.settings.theme
      : 'system',
  }
  const config: AppConfig = {
    version: 1,
    profiles: incoming.map(profile => ({
      ...profile,
      hasKey: Boolean(secrets[profile.id]),
      apiKey: undefined,
      clearApiKey: undefined,
    })),
    activeProfileId,
    settings,
  }
  writeJson(CONFIG_FILE, config)
  return loadConfig()
}

export function clearApiKey(profileId: string): void {
  const secrets = readSecrets()
  delete secrets[profileId]
  writeSecrets(secrets)
}

export function loadConversations(): Conversation[] {
  const raw = readJson<unknown>(CONVERSATIONS_FILE, [])
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is Conversation => Boolean(item && typeof item === 'object'))
    .map(item => ({
      ...item,
      messages: Array.isArray(item.messages) ? item.messages : [],
      pinned: Boolean(item.pinned),
      archived: Boolean(item.archived),
    }))
}

export function saveConversations(conversations: Conversation[]): void {
  writeJson(CONVERSATIONS_FILE, Array.isArray(conversations) ? conversations : [])
}

export function saveAttachment(input: SaveAttachmentInput): Attachment {
  const mime = input.mimeType || 'image/jpeg'
  const extension = mime.includes('png')
    ? 'png'
    : mime.includes('webp')
      ? 'webp'
      : mime.includes('gif')
        ? 'gif'
        : 'jpg'
  const id = `${randomUUID()}.${extension}`
  const bytes = Buffer.from(input.base64, 'base64')
  if (!bytes.length) throw new Error('附件内容为空')
  if (bytes.length > 20 * 1024 * 1024) throw new Error('单张图片不能超过 20 MB')
  fs.writeFileSync(path.join(attachmentsDir(), id), bytes)
  return {
    id,
    name: String(input.name || 'image').slice(0, 200),
    mimeType: mime,
    size: bytes.length,
    width: Number(input.width) || 0,
    height: Number(input.height) || 0,
    url: `aster-media://media/${encodeURIComponent(id)}`,
  }
}

export function attachmentPath(id: string): string {
  const safe = path.basename(id)
  return path.join(attachmentsDir(), safe)
}

export function attachmentData(id: string, mimeType: string): { base64: string; mimeType: string } {
  const file = attachmentPath(id)
  const bytes = fs.readFileSync(file)
  return { base64: bytes.toString('base64'), mimeType }
}
