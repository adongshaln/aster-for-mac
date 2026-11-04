import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  ExternalLink,
  FolderOpen,
  Globe2,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type {
  AppInfo,
  InjectionPosition,
  InjectionRole,
  Profile,
  PromptInjectionEntry,
  ThemeMode,
} from '@shared/types'
import { defaultInjectionPresets, NY_GEMINI_DEMO_PRESET_ID } from '@shared/presets'
import { normalizeEffort, reasoningChoices, DEFAULT_REASONING } from '@shared/reasoning'
import { AsterMark } from '@/components/AsterMark'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { CdsSelect, ModelAutocompleteField } from '@/components/ui/Select'
import { Switch } from '@/components/ui/Switch'
import { Modal } from '@/components/ui/Modal'
import { useAppStore, type SettingsSection } from '@/state/store'
import { cn, uid } from '@/lib/utils'

interface Draft extends Profile {
  apiKey: string
  clearApiKey: boolean
}

const sections: { id: SettingsSection; label: string }[] = [
  { id: 'general', label: '通用' },
  { id: 'services', label: '模型服务' },
  { id: 'injections', label: '提示词注入' },
  { id: 'tools', label: '工具与技能' },
  { id: 'appearance', label: '外观' },
  { id: 'about', label: '关于' },
]

function emptyProfile(): Draft {
  return {
    id: uid(),
    name: '新服务',
    baseUrl: '',
    apiFormat: 'openai',
    modelsPath: '/v1/models',
    chatPath: '/v1/chat/completions',
    responsesPath: '/v1/responses',
    messagesPath: '/v1/messages',
    imagePath: '/v1/images/generations',
    imageEditPath: '/v1/images/edits',
    imageApiMode: 'auto',
    extraHeaders: '',
    chatModel: '',
    reasoningEffort: DEFAULT_REASONING,
    contextLimit: 128_000,
    models: [],
    hasKey: false,
    apiKey: '',
    clearApiKey: false,
    lastLatencyMs: null,
  }
}

function toDraft(profile: Profile): Draft {
  return {
    ...profile,
    apiKey: '',
    clearApiKey: false,
  }
}

export function SettingsDialog() {
  const open = useAppStore(state => state.settingsOpen)
  const section = useAppStore(state => state.settingsSection)
  const config = useAppStore(state => state.config)
  const appInfo = useAppStore(state => state.appInfo)
  const close = useAppStore(state => state.closeSettings)
  const setSection = useAppStore(state => state.openSettings)

  return (
    <Modal open={open} onClose={close} width={920} className="outline-none">
      <div className="flex h-[min(660px,calc(100vh-48px))] overflow-hidden rounded-[18px] border border-[var(--cds-border)] bg-[var(--cds-surface-1)] shadow-popover">
        <aside className="flex w-[190px] shrink-0 flex-col border-r border-[var(--cds-border)] bg-[var(--cds-surface-0)] px-2.5 py-4">
          <div className="px-2 pb-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--cds-text-muted)]">设置</div>
          {sections.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={cn(
                'mb-0.5 flex h-9 items-center rounded-lg px-2.5 text-left text-[12.5px] font-medium transition-colors',
                section === item.id
                  ? 'bg-[var(--cds-fill-ghost-selected)] text-[var(--cds-text-primary)]'
                  : 'text-[var(--cds-text-secondary)] hover:bg-[var(--cds-fill-ghost-hover)] hover:text-[var(--cds-text-primary)]',
              )}
            >
              {item.label}
              {section === item.id && <span className="ml-auto size-1 rounded-full bg-clay" />}
            </button>
          ))}
          <div className="mt-auto px-2 text-[9.5px] leading-relaxed text-[var(--cds-text-muted)]">
            Aster for macOS
            <br />
            {appInfo ? `v${appInfo.version}` : ''}
          </div>
        </aside>

        <div className="relative flex min-w-0 flex-1 flex-col">
          <button
            type="button"
            onClick={close}
            className="absolute right-3 top-3 z-10 flex size-7 items-center justify-center rounded-lg text-[var(--cds-text-muted)] transition-colors hover:bg-[var(--cds-fill-ghost-hover)] hover:text-[var(--cds-text-primary)]"
            title="关闭"
          >
            <X size={14} />
          </button>
          <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-7 py-6">
            {section === 'general' && <GeneralSettings />}
            {section === 'services' && <ServiceSettings />}
            {section === 'injections' && <PromptInjectionsSettings />}
            {section === 'tools' && <ToolsAndSkillsSettings />}
            {section === 'appearance' && <AppearanceSettings />}
            {section === 'about' && <AboutSettings appInfo={appInfo} />}
          </div>
        </div>
      </div>
    </Modal>
  )
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6 pr-10">
      <h2 className="text-[18px] font-semibold tracking-[-0.025em]">{title}</h2>
      <p className="mt-1 text-[12px] leading-relaxed text-[var(--cds-text-secondary)]">{description}</p>
    </div>
  )
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-8 border-b border-[var(--cds-border)] py-3.5 last:border-none">
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium">{title}</div>
        {description && <div className="mt-0.5 text-[11px] leading-relaxed text-[var(--cds-text-muted)]">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function GeneralSettings() {
  const config = useAppStore(state => state.config)
  const updateSettings = useAppStore(state => state.updateSettings)
  const [name, setName] = useState(config?.settings.userName ?? '')
  const [prompt, setPrompt] = useState(config?.settings.systemPrompt ?? '')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setName(config?.settings.userName ?? '')
    setPrompt(config?.settings.systemPrompt ?? '')
  }, [config?.settings.userName, config?.settings.systemPrompt])

  const save = async () => {
    await updateSettings({ userName: name.trim(), systemPrompt: prompt })
    setSaved(true)
    setTimeout(() => setSaved(false), 1600)
  }

  return (
    <div>
      <SectionHeader title="通用" description="称呼、系统提示词与输入习惯。" />
      <div className="space-y-5">
        <div>
          <label className="cds-label">怎么称呼你</label>
          <input
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="留空则使用普通问候"
            className="cds-input max-w-[360px]"
          />
        </div>
        <div>
          <label className="cds-label">自定义系统提示词</label>
          <textarea
            value={prompt}
            onChange={event => setPrompt(event.target.value)}
            className="cds-input cds-textarea scroll-quiet min-h-[150px]"
            placeholder="描述你希望 Aster 如何回答…"
          />
          <div className="cds-hint">这段文字会随每次请求发送。称呼不会进入系统提示词。</div>
        </div>
        <div>
          <SettingRow title="Enter 发送" description="关闭后使用 ⌘ + Enter 发送。">
            <Switch
              checked={config?.settings.enterToSend ?? true}
              onChange={value => void updateSettings({ enterToSend: value })}
            />
          </SettingRow>
          <SettingRow title="正文开始后自动收起思考" description="流式输出正文时，把思考面板折叠起来。">
            <Switch
              checked={config?.settings.autoCollapseThinking ?? true}
              onChange={value => void updateSettings({ autoCollapseThinking: value })}
            />
          </SettingRow>
          <SettingRow title="显示 Token 用量" description="在回答下方展示请求用量与耗时。">
            <Switch
              checked={config?.settings.showTokenUsage ?? true}
              onChange={value => void updateSettings({ showTokenUsage: value })}
            />
          </SettingRow>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-[var(--cds-text-primary)] px-3 text-[11.5px] font-semibold text-[var(--cds-surface-1)] transition-opacity hover:opacity-90"
          >
            {saved ? <Check size={12} /> : null}
            {saved ? '已保存' : '保存更改'}
          </button>
          <span className="text-[10.5px] text-[var(--cds-text-muted)]">修改后需保存</span>
        </div>
      </div>
    </div>
  )
}

function ServiceSettings() {
  const config = useAppStore(state => state.config)
  const saveConfig = useAppStore(state => state.saveConfig)
  const setActiveProfile = useAppStore(state => state.setActiveProfile)
  const showToast = useAppStore(state => state.showToast)
  const [selectedId, setSelectedId] = useState(config?.activeProfileId || config?.profiles[0]?.id || 'new')
  const [draft, setDraft] = useState<Draft>(() => {
    const selected = config?.profiles.find(profile => profile.id === selectedId)
    return selected ? toDraft(selected) : emptyProfile()
  })
  const [showKey, setShowKey] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isNew = selectedId === 'new'
  const selectedProfile = config?.profiles.find(profile => profile.id === selectedId)

  useEffect(() => {
    const profile = config?.profiles.find(item => item.id === selectedId)
    if (profile) {
      setDraft(toDraft(profile))
      setConfirmDelete(false)
    }
    // Only intentionally re-seed the editor when the selected service changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  useEffect(() => {
    if (selectedId !== 'new' && config && !config.profiles.some(profile => profile.id === selectedId)) {
      const next = config.profiles[0]?.id ?? 'new'
      setSelectedId(next)
      const profile = config.profiles[0]
      setDraft(profile ? toDraft(profile) : emptyProfile())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.profiles.length])

  const choices = useMemo(() => reasoningChoices(draft.chatModel), [draft.chatModel])

  const selectProfile = (profile: Profile) => {
    setSelectedId(profile.id)
    setDraft(toDraft(profile))
    setConfirmDelete(false)
    setAdvanced(false)
  }

  const startNew = () => {
    setSelectedId('new')
    setDraft(emptyProfile())
    setAdvanced(false)
    setConfirmDelete(false)
  }

  const save = async (): Promise<Profile | undefined> => {
    const current = useAppStore.getState().config
    if (!current) return
    if (!/^https?:\/\//i.test(draft.baseUrl.trim())) {
      showToast('Base URL 必须以 http:// 或 https:// 开头', 'error')
      return
    }
    setSaving(true)
    try {
      const profile: Profile = {
        ...draft,
        name: draft.name.trim() || '未命名服务',
        baseUrl: draft.baseUrl.trim().replace(/\/+$/, ''),
        apiKey: draft.apiKey.trim() || undefined,
        clearApiKey: draft.clearApiKey || undefined,
        hasKey: draft.hasKey || Boolean(draft.apiKey.trim()),
      }
      const exists = current.profiles.some(item => item.id === profile.id)
      const profiles = exists
        ? current.profiles.map(item => (item.id === profile.id ? profile : item))
        : [...current.profiles, profile]
      const saved = await saveConfig({
        ...current,
        profiles,
        activeProfileId: current.activeProfileId || profile.id,
      })
      const fresh = saved.profiles.find(item => item.id === profile.id)
      if (fresh) {
        setSelectedId(fresh.id)
        setDraft({ ...toDraft(fresh), apiKey: '', clearApiKey: false })
      }
      return fresh
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
      return undefined
    } finally {
      setSaving(false)
    }
  }

  const fetchModels = async () => {
    if (!/^https?:\/\//i.test(draft.baseUrl.trim())) {
      showToast('请先填写有效的 Base URL', 'error')
      return
    }
    const saved = await save()
    if (!saved) return
    setFetching(true)
    try {
      const result = await window.aster.models.fetch(saved.id)
      const current = useAppStore.getState().config
      if (current) {
        const updated = await saveConfig({
          ...current,
          profiles: current.profiles.map(profile => (
            profile.id === saved.id
              ? { ...profile, models: result.models, lastLatencyMs: result.latencyMs }
              : profile
          )),
        })
        const fresh = updated.profiles.find(profile => profile.id === saved.id)
        if (fresh) {
          setDraft(currentDraft => ({
            ...currentDraft,
            models: fresh.models,
            lastLatencyMs: fresh.lastLatencyMs,
            chatModel: currentDraft.chatModel || fresh.models[0]?.id || '',
          }))
        }
      }
      showToast(`连接成功 · ${result.models.length} 个模型 · ${result.latencyMs} ms`, 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setFetching(false)
    }
  }

  const remove = async () => {
    const current = useAppStore.getState().config
    if (!current) return
    await window.aster.secrets.clear(draft.id)
    const profiles = current.profiles.filter(profile => profile.id !== draft.id)
    const saved = await saveConfig({
      ...current,
      profiles,
      activeProfileId: current.activeProfileId === draft.id ? (profiles[0]?.id ?? '') : current.activeProfileId,
    })
    const next = saved.profiles[0]
    if (next) {
      setSelectedId(next.id)
      setDraft(toDraft(next))
    } else {
      startNew()
    }
    setConfirmDelete(false)
    showToast('已删除该服务', 'success')
  }

  const clearKey = async () => {
    await window.aster.secrets.clear(draft.id)
    const current = useAppStore.getState().config
    if (current) {
      await saveConfig({
        ...current,
        profiles: current.profiles.map(profile => (
          profile.id === draft.id ? { ...profile, hasKey: false } : profile
        )),
      })
    }
    setDraft(value => ({ ...value, hasKey: false, apiKey: '', clearApiKey: false }))
    showToast('已清除 API 密钥', 'success')
  }

  return (
    <div>
      <SectionHeader title="模型服务" description="连接 OpenAI 兼容服务或 Anthropic Messages 服务。密钥仅保存在本机钥匙串中。" />
      <div className="flex gap-5">
        <div className="w-[196px] shrink-0">
          <div className="mb-2 space-y-1">
            {(!config?.profiles || config.profiles.length === 0) && (
              <div className="flex items-center gap-2 rounded-lg bg-clay/[0.08] px-2.5 py-2 text-left">
                <span className="size-1.5 shrink-0 rounded-full bg-clay" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11.5px] font-medium text-clay">
                    {draft.name || '新服务'}
                  </span>
                  <span className="mt-0.5 block truncate text-[9.5px] text-[var(--cds-text-muted)]">
                    {draft.baseUrl || '待填写服务地址'}
                  </span>
                </span>
              </div>
            )}
            {config?.profiles.map(profile => {
              const active = profile.id === selectedId
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => selectProfile(profile)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors',
                    active ? 'bg-clay/[0.08]' : 'hover:bg-[var(--cds-fill-ghost-hover)]',
                  )}
                >
                  <span className={cn('size-1.5 shrink-0 rounded-full', profile.id === config.activeProfileId ? 'bg-clay' : 'bg-[var(--cds-border-strong)]')} />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-[11.5px] font-medium', active ? 'text-clay' : 'text-[var(--cds-text-primary)]')}>
                      {profile.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[9.5px] text-[var(--cds-text-muted)]">
                      {profile.baseUrl || '未填写地址'}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={startNew}
            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--cds-border-strong)] text-[11px] font-medium text-[var(--cds-text-secondary)] transition-colors hover:border-clay/50 hover:text-clay"
          >
            <Plus size={11} />
            添加服务
          </button>
        </div>

        <div className="min-w-0 flex-1 rounded-xl border border-[var(--cds-border)] bg-[var(--cds-surface-2)] p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold">{isNew ? '新服务' : draft.name}</div>
              <div className="mt-0.5 text-[10px] text-[var(--cds-text-muted)]">
                {draft.lastLatencyMs ? `上次连接 ${draft.lastLatencyMs} ms` : '尚未测试连接'}
              </div>
            </div>
            {!isNew && (
              <button
                type="button"
                onClick={() => {
                  if (confirmDelete) void remove()
                  else setConfirmDelete(true)
                }}
                onBlur={() => setConfirmDelete(false)}
                className={cn(
                  'flex h-7 items-center gap-1 rounded-lg px-2 text-[10.5px] font-medium transition-colors',
                  confirmDelete
                    ? 'bg-red-500 text-white'
                    : 'text-[var(--cds-text-muted)] hover:bg-red-500/10 hover:text-red-500',
                )}
              >
                <Trash2 size={11} />
                {confirmDelete ? '确认删除' : '删除'}
              </button>
            )}
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="cds-label">名称</label>
                <input
                  value={draft.name}
                  onChange={event => setDraft(value => ({ ...value, name: event.target.value }))}
                  className="cds-input"
                  placeholder="例如 OpenAI"
                />
              </div>
              <div>
                <label className="cds-label">接口格式</label>
                <SegmentedControl
                  size="sm"
                  value={draft.apiFormat}
                  options={[
                    { value: 'openai', label: 'OpenAI 兼容' },
                    { value: 'anthropic', label: 'Anthropic' },
                  ]}
                  onChange={value => setDraft(current => ({ ...current, apiFormat: value }))}
                />
              </div>
            </div>

            <div>
              <label className="cds-label">Base URL</label>
              <input
                value={draft.baseUrl}
                onChange={event => setDraft(value => ({ ...value, baseUrl: event.target.value }))}
                className="cds-input font-mono text-[12px]"
                placeholder={draft.apiFormat === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com'}
                spellCheck={false}
              />
              <div className="cds-hint">只填服务根地址，路径在下面的高级设置中配置。</div>
            </div>

            <div>
              <label className="cds-label">API 密钥</label>
              <div className="flex items-center gap-2">
                <div className="relative flex min-w-0 flex-1 items-center">
                  <KeyRound size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cds-text-muted)]" />
                  <input
                    value={draft.apiKey}
                    type={showKey ? 'text' : 'password'}
                    onChange={event => setDraft(value => ({ ...value, apiKey: event.target.value }))}
                    className="cds-input pl-9 pr-8 font-mono text-[12px]"
                    placeholder={draft.hasKey ? '已保存，留空保持不变' : 'sk-...'}
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(value => !value)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--cds-text-muted)] hover:text-[var(--cds-text-primary)]"
                  >
                    {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                {draft.hasKey && (
                  <button
                    type="button"
                    onClick={() => void clearKey()}
                    className="h-9 shrink-0 rounded-lg border border-[var(--cds-border)] px-2.5 text-[11px] font-medium text-[var(--cds-text-secondary)] transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-500"
                  >
                    清除
                  </button>
                )}
              </div>
              <div className="cds-hint flex items-center gap-1">
                <KeyRound size={9} />
                通过 macOS 钥匙串加密保存，不写入对话文件。
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="cds-label !mb-0">默认模型</label>
                  {draft.models.length > 0 && (
                    <span className="font-mono text-[10px] text-[var(--cds-text-muted)]">
                      共 {draft.models.length} 个可用
                    </span>
                  )}
                </div>
                <ModelAutocompleteField
                  value={draft.chatModel}
                  models={draft.models}
                  onChange={nextModel =>
                    setDraft(value => ({
                      ...value,
                      chatModel: nextModel,
                      reasoningEffort: normalizeEffort(nextModel, value.reasoningEffort),
                    }))
                  }
                  placeholder="拉取模型后选择或直接输入"
                />
              </div>
              <div>
                <label className="cds-label">上下文预算</label>
                <input
                  type="number"
                  min={4096}
                  step={1000}
                  value={draft.contextLimit}
                  onChange={event => setDraft(value => ({ ...value, contextLimit: Number(event.target.value) || 128_000 }))}
                  className="cds-input font-mono text-[12px]"
                />
                <div className="cds-hint">用于历史裁剪与用量环。</div>
              </div>
            </div>

            <div>
              <label className="cds-label">默认思考强度</label>
              <CdsSelect
                value={draft.reasoningEffort}
                disabled={!choices.length}
                options={(choices.length
                  ? choices
                  : [{ id: DEFAULT_REASONING, label: '该模型不支持思考参数', hint: '' }]
                ).map(choice => ({
                  value: choice.id,
                  label: choice.label,
                  hint: choice.hint,
                }))}
                onChange={nextEffort => setDraft(value => ({ ...value, reasoningEffort: nextEffort }))}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="flex h-8 items-center gap-1.5 rounded-lg bg-clay px-3 text-[11.5px] font-semibold text-white transition-all hover:bg-clay-hover active:scale-[0.98] disabled:opacity-50"
              >
                {saving && <Loader2 size={11} className="animate-spin" />}
                保存服务
              </button>
              <button
                type="button"
                onClick={() => void fetchModels()}
                disabled={fetching || saving}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--cds-border-strong)] px-3 text-[11.5px] font-medium text-[var(--cds-text-secondary)] transition-colors hover:border-clay/50 hover:text-clay disabled:opacity-50"
              >
                {fetching ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                测试并拉取模型
              </button>
              {!isNew && config?.activeProfileId !== draft.id && (
                <button
                  type="button"
                  onClick={() => {
                    void setActiveProfile(draft.id)
                    showToast('已设为新对话的默认服务', 'success')
                  }}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-clay/35 px-3 text-[11.5px] font-medium text-clay transition-colors hover:bg-clay/[0.06]"
                >
                  设为默认
                </button>
              )}
              <button
                type="button"
                onClick={() => setAdvanced(value => !value)}
                className="ml-auto flex h-8 items-center gap-1 rounded-lg px-2 text-[10.5px] font-medium text-[var(--cds-text-muted)] hover:text-[var(--cds-text-primary)]"
              >
                <Globe2 size={11} />
                高级
                <ChevronDown size={10} className={cn('transition-transform', advanced && 'rotate-180')} />
              </button>
            </div>

            {advanced && (
              <div className="settings-section-enter mt-1 space-y-3 border-t border-[var(--cds-border)] pt-3">
                <div className="grid grid-cols-2 gap-3">
                  <PathField label="模型列表路径" value={draft.modelsPath} onChange={value => setDraft(current => ({ ...current, modelsPath: value }))} />
                  <PathField label="Chat Completions 路径" value={draft.chatPath} onChange={value => setDraft(current => ({ ...current, chatPath: value }))} />
                  <PathField label="Responses 路径" value={draft.responsesPath} onChange={value => setDraft(current => ({ ...current, responsesPath: value }))} />
                  <PathField label="Messages 路径" value={draft.messagesPath} onChange={value => setDraft(current => ({ ...current, messagesPath: value }))} />
                  <PathField label="图片生成路径" value={draft.imagePath} onChange={value => setDraft(current => ({ ...current, imagePath: value }))} />
                </div>
                <div>
                  <label className="cds-label">图片接口</label>
                  <CdsSelect
                    value={draft.imageApiMode}
                    options={[
                      { value: 'auto', label: '自动识别', hint: '含 gemini 与 image 时走 Gemini，否则走 OpenAI Images' },
                      { value: 'openai', label: 'OpenAI Images', hint: '使用 /v1/images/generations' },
                      { value: 'gemini', label: 'Gemini 多模态', hint: '使用原生 generateContent 多模态生图' },
                    ]}
                    onChange={nextMode =>
                      setDraft(current => ({ ...current, imageApiMode: nextMode as Profile['imageApiMode'] }))
                    }
                  />
                  <div className="cds-hint">自动：模型名含 gemini 且含 image 时走 Gemini，否则使用图片生成路径。</div>
                </div>
                <div>
                  <label className="cds-label">额外请求头</label>
                  <textarea
                    value={draft.extraHeaders}
                    onChange={event => setDraft(value => ({ ...value, extraHeaders: event.target.value }))}
                    className="cds-input cds-textarea scroll-quiet min-h-[72px] font-mono text-[11.5px]"
                    placeholder={'X-Custom-Header: value\nAnother-Header: value'}
                    spellCheck={false}
                  />
                  <div className="cds-hint">每行一个 Header，使用冒号分隔。Authorization 与 x-api-key 由客户端自动写入。</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function PathField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="cds-label">{label}</label>
      <input
        value={value}
        onChange={event => onChange(event.target.value)}
        className="cds-input font-mono text-[11px]"
        spellCheck={false}
      />
    </div>
  )
}

function PromptInjectionsSettings() {
  const settings = useAppStore(state => state.config?.settings)
  const togglePromptInjection = useAppStore(state => state.togglePromptInjection)
  const saveInjectionPresets = useAppStore(state => state.saveInjectionPresets)
  const resetBuiltInInjectionPreset = useAppStore(state => state.resetBuiltInInjectionPreset)
  const showToast = useAppStore(state => state.showToast)

  const presets = useMemo(
    () => (settings?.injectionPresets?.length ? settings.injectionPresets : defaultInjectionPresets()),
    [settings?.injectionPresets],
  )
  const activePresetId = settings?.activeInjectionPresetId || presets[0]?.id || NY_GEMINI_DEMO_PRESET_ID
  const activePreset = presets.find(p => p.id === activePresetId) ?? presets[0]
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)

  const updateCurrentPresetEntries = async (nextEntries: PromptInjectionEntry[]) => {
    if (!activePreset) return
    const nextPresets = presets.map(p => (p.id === activePreset.id ? { ...p, entries: nextEntries } : p))
    await saveInjectionPresets(nextPresets, activePreset.id)
  }

  const handleToggleEntry = async (entryId: string) => {
    if (!activePreset) return
    const next = activePreset.entries.map(e => (e.id === entryId ? { ...e, enabled: !e.enabled } : e))
    await updateCurrentPresetEntries(next)
  }

  const handleUpdateEntry = async (entryId: string, patch: Partial<PromptInjectionEntry>) => {
    if (!activePreset) return
    const next = activePreset.entries.map(e => (e.id === entryId ? { ...e, ...patch } : e))
    await updateCurrentPresetEntries(next)
  }

  const handleMoveEntry = async (index: number, delta: -1 | 1) => {
    if (!activePreset) return
    const target = index + delta
    if (target < 0 || target >= activePreset.entries.length) return
    const copy = [...activePreset.entries]
    const [moved] = copy.splice(index, 1)
    copy.splice(target, 0, moved)
    await updateCurrentPresetEntries(copy)
  }

  const handleAddEntry = async () => {
    if (!activePreset) return
    const newEntry: PromptInjectionEntry = {
      id: `inj-${uid().slice(0, 8)}`,
      name: '新注入指令',
      description: '自定义按需注入提示词',
      role: 'system',
      position: 'after_history',
      depth: 0,
      content: '',
      enabled: true,
    }
    await updateCurrentPresetEntries([...activePreset.entries, newEntry])
    setEditingEntryId(newEntry.id)
  }

  const handleDeleteEntry = async (entryId: string) => {
    if (!activePreset) return
    await updateCurrentPresetEntries(activePreset.entries.filter(e => e.id !== entryId))
    if (editingEntryId === entryId) setEditingEntryId(null)
  }

  const handleCreatePreset = async () => {
    const newPreset = {
      id: `preset-${uid().slice(0, 8)}`,
      name: `自定义注入组 ${presets.length}`,
      description: '自定义提示词按需注入组合',
      builtIn: false,
      entries: [
        {
          id: `inj-${uid().slice(0, 8)}`,
          name: '核心要求',
          description: '后置强约束指令',
          role: 'system' as InjectionRole,
          position: 'after_history' as InjectionPosition,
          content: '请直接回答核心问题，不要输出寒暄或免责声明。',
          enabled: true,
        },
      ],
    }
    await saveInjectionPresets([...presets, newPreset], newPreset.id)
    showToast(`已创建「${newPreset.name}」`, 'success')
  }

  const enabledCount = activePreset ? activePreset.entries.filter(e => e.enabled).length : 0

  return (
    <div>
      <SectionHeader
        title="提示词注入 (Prompt Injection)"
        description="按需在对话前、对话末尾或指定历史深度注入 System / User / Assistant 提示词模块。内置已剔除故事冗余的「Ny-Gemini 1.4.3 · 越狱演示模式」。"
      />

      <div className="mb-5 flex items-center justify-between rounded-xl border border-[var(--cds-border)] bg-[var(--cds-surface-0)] px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            <span>启用提示词按需注入</span>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                settings?.promptInjectionEnabled
                  ? 'bg-clay/15 text-clay'
                  : 'bg-black/[0.05] text-[var(--cds-text-muted)] dark:bg-white/[0.06]',
              )}
            >
              {settings?.promptInjectionEnabled ? `已启用 · ${enabledCount} 项生效` : '未开启'}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--cds-text-muted)]">
            开启后，勾选的条目会按各自设定的角色（system / user / assistant）与位置注入到每次模型请求中。
          </div>
        </div>
        <Switch
          checked={settings?.promptInjectionEnabled ?? false}
          onChange={() => void togglePromptInjection()}
        />
      </div>

      {/* Preset selector bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {presets.map(preset => {
          const active = preset.id === activePreset?.id
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => void saveInjectionPresets(presets, preset.id)}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium transition-colors',
                active
                  ? 'border-clay/50 bg-clay/10 text-clay'
                  : 'border-[var(--cds-border)] bg-[var(--cds-surface-2)] text-[var(--cds-text-secondary)] hover:text-[var(--cds-text-primary)]',
              )}
            >
              <span>{preset.name}</span>
              <span className="rounded bg-black/[0.05] px-1.5 py-0.2 font-mono text-[10px] dark:bg-white/[0.08]">
                {preset.entries.filter(e => e.enabled).length}/{preset.entries.length}
              </span>
            </button>
          )
        })}

        <button
          type="button"
          onClick={() => void handleCreatePreset()}
          className="flex h-8 items-center gap-1 rounded-lg border border-dashed border-[var(--cds-border-strong)] px-2.5 text-[11.5px] font-medium text-[var(--cds-text-secondary)] hover:border-clay/50 hover:text-clay"
        >
          <Plus size={12} />
          新建注入组
        </button>

        {activePreset?.id === NY_GEMINI_DEMO_PRESET_ID && (
          <button
            type="button"
            onClick={() => void resetBuiltInInjectionPreset()}
            className="ml-auto flex h-8 items-center gap-1 rounded-lg border border-[var(--cds-border)] px-2.5 text-[11px] font-medium text-[var(--cds-text-muted)] hover:border-clay/40 hover:text-clay"
            title="恢复 Ny-Gemini 演示模式默认条目"
          >
            <RotateCcw size={11} />
            重置演示预设
          </button>
        )}
      </div>

      {activePreset && (
        <div className="space-y-2.5">
          <div className="mb-3 grid grid-cols-2 gap-2.5">
            <div className="flex items-center justify-between rounded-xl border border-[var(--cds-border)] bg-[var(--cds-surface-0)] px-3.5 py-2.5">
              <div className="min-w-0 pr-2">
                <div className="text-[12px] font-semibold">纯净酒馆发包模式 (Pure Mode)</div>
                <div className="mt-0.5 text-[10.5px] leading-snug text-[var(--cds-text-muted)]">
                  屏蔽默认助手 System Prompt 与工具挂载，锁定三明治沙箱顺序不被网关抽离
                </div>
              </div>
              <Switch
                checked={activePreset.pureMode ?? true}
                onChange={checked => {
                  const next = presets.map(p =>
                    p.id === activePreset.id ? { ...p, pureMode: checked } : p,
                  )
                  void saveInjectionPresets(next, activePreset.id)
                }}
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-[var(--cds-border)] bg-[var(--cds-surface-0)] px-3.5 py-2.5">
              <div className="min-w-0 pr-2">
                <div className="text-[12px] font-semibold">Ny-结构越狱 · 零宽字符防审查</div>
                <div className="mt-0.5 text-[10.5px] leading-snug text-[var(--cds-text-muted)]">
                  发送前自动执行一步正则清洗与敏感词零宽连接符混淆，绕过网关字面拦截
                </div>
              </div>
              <Switch
                checked={activePreset.zeroWidthObfuscation ?? true}
                onChange={checked => {
                  const next = presets.map(p =>
                    p.id === activePreset.id ? { ...p, zeroWidthObfuscation: checked } : p,
                  )
                  void saveInjectionPresets(next, activePreset.id)
                }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between px-1 text-[11px] text-[var(--cds-text-muted)]">
            <span>{activePreset.description}</span>
            <button
              type="button"
              onClick={() => void handleAddEntry()}
              className="flex items-center gap-1 font-medium text-clay hover:underline"
            >
              <Plus size={12} />
              添加注入条目
            </button>
          </div>

          {activePreset.entries.map((entry, idx) => {
            const expanded = editingEntryId === entry.id
            return (
              <div
                key={entry.id}
                className={cn(
                  'overflow-hidden rounded-xl border transition-colors',
                  entry.enabled
                    ? 'border-[var(--cds-border-strong)] bg-[var(--cds-surface-2)]'
                    : 'border-[var(--cds-border)] bg-[var(--cds-surface-0)] opacity-80',
                )}
              >
                <div className="flex items-center gap-2.5 px-3.5 py-2.5">
                  <button
                    type="button"
                    onClick={() => setEditingEntryId(expanded ? null : entry.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[12.5px] font-semibold text-[var(--cds-text-primary)]">
                        {entry.name}
                      </span>
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase',
                          entry.role === 'assistant'
                            ? 'bg-clay/15 text-clay'
                            : entry.role === 'user'
                              ? 'bg-[#3b6ecf]/15 text-[#3b6ecf]'
                              : 'bg-black/[0.06] text-[var(--cds-text-secondary)] dark:bg-white/[0.08]',
                        )}
                      >
                        {entry.role}
                      </span>
                      <span className="rounded bg-black/[0.04] px-1.5 py-0.5 font-mono text-[9.5px] text-[var(--cds-text-muted)] dark:bg-white/[0.06]">
                        {entry.position === 'before_history'
                          ? '对话前 (Pre-History)'
                          : entry.position === 'in_chat'
                            ? `深度插入 (D=${entry.depth ?? 0})`
                            : '对话末尾 (Post-History)'}
                      </span>
                    </div>
                    {entry.description && (
                      <div className="mt-0.5 truncate text-[11px] text-[var(--cds-text-muted)]">
                        {entry.description}
                      </div>
                    )}
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => void handleMoveEntry(idx, -1)}
                      className="rounded p-1 text-[var(--cds-text-muted)] hover:bg-[var(--cds-fill-ghost-hover)] hover:text-[var(--cds-text-primary)] disabled:opacity-25"
                      title="上移"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      type="button"
                      disabled={idx === activePreset.entries.length - 1}
                      onClick={() => void handleMoveEntry(idx, 1)}
                      className="rounded p-1 text-[var(--cds-text-muted)] hover:bg-[var(--cds-fill-ghost-hover)] hover:text-[var(--cds-text-primary)] disabled:opacity-25"
                      title="下移"
                    >
                      <ArrowDown size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingEntryId(expanded ? null : entry.id)}
                      className="rounded px-2 py-1 text-[11px] font-medium text-[var(--cds-text-secondary)] hover:bg-[var(--cds-fill-ghost-hover)]"
                    >
                      {expanded ? '收起' : '编辑'}
                    </button>
                    <Switch
                      checked={entry.enabled}
                      onChange={() => void handleToggleEntry(entry.id)}
                    />
                  </div>
                </div>

                {expanded && (
                  <div className="space-y-3 border-t border-[var(--cds-border)] bg-[var(--cds-surface-1)] px-4 py-3.5">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="cds-label">条目名称</label>
                        <input
                          value={entry.name}
                          onChange={e => void handleUpdateEntry(entry.id, { name: e.target.value })}
                          className="cds-input text-[12px]"
                        />
                      </div>
                      <div>
                        <label className="cds-label">简短说明</label>
                        <input
                          value={entry.description ?? ''}
                          onChange={e => void handleUpdateEntry(entry.id, { description: e.target.value })}
                          className="cds-input text-[12px]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="cds-label">注入角色 (Role)</label>
                        <CdsSelect
                          value={entry.role}
                          options={[
                            { value: 'system', label: 'System (系统指令)' },
                            { value: 'user', label: 'User (用户指令)' },
                            { value: 'assistant', label: 'Assistant (助手预填/确认)' },
                          ]}
                          onChange={nextRole =>
                            void handleUpdateEntry(entry.id, { role: nextRole as InjectionRole })
                          }
                        />
                      </div>
                      <div>
                        <label className="cds-label">注入位置 (Position)</label>
                        <CdsSelect
                          value={entry.position}
                          options={[
                            { value: 'before_history', label: '对话历史前 (Pre-History)' },
                            { value: 'after_history', label: '对话历史末尾 (Post-History)' },
                            { value: 'in_chat', label: '按历史深度穿插 (In-Chat Depth)' },
                          ]}
                          onChange={nextPos =>
                            void handleUpdateEntry(entry.id, {
                              position: nextPos as InjectionPosition,
                            })
                          }
                        />
                      </div>
                      {entry.position === 'in_chat' && (
                        <div>
                          <label className="cds-label">深度 Depth (0=最末)</label>
                          <input
                            type="number"
                            min={0}
                            max={50}
                            value={entry.depth ?? 0}
                            onChange={e =>
                              void handleUpdateEntry(entry.id, {
                                depth: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className="cds-input font-mono text-[12px]"
                          />
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="cds-label">
                        注入提示词内容（支持变量：<code className="font-mono">{'{{date}}'}</code>、
                        <code className="font-mono">{'{{time}}'}</code>、
                        <code className="font-mono">{'{{workspace}}'}</code>、
                        <code className="font-mono">{'{{lastUserMessage}}'}</code>）
                      </label>
                      <textarea
                        value={entry.content}
                        onChange={e => void handleUpdateEntry(entry.id, { content: e.target.value })}
                        className="cds-input cds-textarea scroll-quiet min-h-[120px] font-mono text-[11.5px] leading-relaxed"
                        spellCheck={false}
                      />
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => void handleDeleteEntry(entry.id)}
                        className="flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-medium text-red-500 hover:bg-red-500/10"
                      >
                        <Trash2 size={12} />
                        删除此条目
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ToolsAndSkillsSettings() {
  const settings = useAppStore(state => state.config?.settings)
  const updateSettings = useAppStore(state => state.updateSettings)
  const pickWorkspaceDirectory = useAppStore(state => state.pickWorkspaceDirectory)
  const installSkill = useAppStore(state => state.installSkill)
  const toggleSkill = useAppStore(state => state.toggleSkill)
  const removeSkill = useAppStore(state => state.removeSkill)
  const showToast = useAppStore(state => state.showToast)

  const [skillUrl, setSkillUrl] = useState('')
  const [installing, setInstalling] = useState(false)

  const skills = settings?.skills ?? []

  const handleInstall = async () => {
    if (!skillUrl.trim() || installing) return
    setInstalling(true)
    try {
      await installSkill(skillUrl.trim())
      setSkillUrl('')
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setInstalling(false)
    }
  }

  return (
    <div>
      <SectionHeader
        title="DeepSeek Harness 工具与技能包"
        description="管理工作区路径、内置 Harness 原生工具权限以及从 GitHub 导入的 SKILL.md 扩展插件。"
      />

      <div className="space-y-1">
        <SettingRow
          title="默认工作区目录 (Workspace)"
          description={settings?.workspaceDir || '~'}
        >
          <button
            type="button"
            onClick={() => void pickWorkspaceDirectory()}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--cds-border)] bg-[var(--cds-surface-2)] px-3 text-[11.5px] font-medium text-[var(--cds-text-primary)] hover:border-clay/50"
          >
            <FolderOpen size={12} className="text-clay" />
            选择目录
          </button>
        </SettingRow>

        <SettingRow
          title="实时并发联网搜索 (web_search / web_fetch)"
          description="允许 Gemini、DeepSeek 等模型自主生成多组关键词并发搜索全网资讯，并支持读取指定网页全文。"
        >
          <Switch
            checked={settings?.webSearchEnabled ?? true}
            onChange={checked => void updateSettings({ webSearchEnabled: checked })}
          />
        </SettingRow>

        <SettingRow
          title="DeepSeek Harness 原生桌面工具"
          description="启用 read / write / edit / glob / grep / bash / todo_write / ask_user_question / subagent / create_artifact。"
        >
          <Switch
            checked={settings?.harnessToolsEnabled ?? true}
            onChange={checked => void updateSettings({ harnessToolsEnabled: checked })}
          />
        </SettingRow>

        <SettingRow
          title="工具执行权限策略"
          description="控制写入文件 (write/edit) 与终端命令 (bash) 的安全审批模式。"
        >
          <SegmentedControl
            value={settings?.permissionMode ?? 'auto'}
            options={[
              { value: 'auto', label: '自动执行' },
              { value: 'ask-destructive', label: '写入前确认' },
              { value: 'plan-only', label: '只读规划' },
            ]}
            onChange={mode => void updateSettings({ permissionMode: mode })}
          />
        </SettingRow>
      </div>

      {/* Skills Manager */}
      <div className="mt-7">
        <div className="text-[13.5px] font-semibold">Skill 技能与插件库</div>
        <p className="mt-0.5 text-[11px] text-[var(--cds-text-muted)]">
          粘贴 GitHub 仓库或 SKILL.md 地址即可安装扩展技能，模型可按需调用 <code className="font-mono">skill</code> 工具加载。
        </p>

        <div className="mt-3 flex items-center gap-2">
          <input
            value={skillUrl}
            onChange={e => setSkillUrl(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') void handleInstall()
            }}
            placeholder="https://github.com/owner/repo 或 SKILL.md 链接"
            className="cds-input flex-1 font-mono text-[11.5px]"
          />
          <button
            type="button"
            disabled={!skillUrl.trim() || installing}
            onClick={() => void handleInstall()}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-clay px-3.5 text-[12px] font-semibold text-white transition-colors hover:bg-clay-hover disabled:opacity-40"
          >
            {installing ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            安装技能
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {skills.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--cds-border)] py-6 text-center text-[11.5px] text-[var(--cds-text-muted)]">
              暂未安装外部 Skill 技能包
            </div>
          ) : (
            skills.map(sk => (
              <div
                key={sk.id}
                className="flex items-center gap-3 rounded-xl border border-[var(--cds-border)] bg-[var(--cds-surface-0)] px-3.5 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px] font-semibold">{sk.name}</span>
                    <span className="truncate font-mono text-[10px] text-[var(--cds-text-muted)]">
                      {sk.sourceUrl}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-[var(--cds-text-secondary)]">
                    {sk.description}
                  </div>
                </div>
                <Switch checked={sk.enabled} onChange={() => void toggleSkill(sk.id)} />
                <button
                  type="button"
                  onClick={() => void removeSkill(sk.id)}
                  className="rounded p-1 text-[var(--cds-text-muted)] hover:bg-[var(--cds-fill-ghost-hover)] hover:text-red-500"
                  title="卸载技能"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function AppearanceSettings() {
  const theme = useAppStore(state => state.config?.settings.theme ?? 'system')
  const setTheme = useAppStore(state => state.setTheme)
  return (
    <div>
      <SectionHeader title="外观" description="跟随系统，或固定为浅色 / 深色。窗口材质与交通灯会同步更新。" />
      <div className="space-y-6">
        <div>
          <label className="cds-label">主题</label>
          <SegmentedControl
            value={theme}
            options={[
              { value: 'light', label: '浅色' },
              { value: 'dark', label: '深色' },
              { value: 'system', label: '跟随系统' },
            ]}
            onChange={(value: ThemeMode) => void setTheme(value)}
          />
        </div>
        <div className="rounded-xl border border-[var(--cds-border)] bg-[var(--cds-surface-0)] p-4">
          <div className="text-[12px] font-semibold">Claude Design System</div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--cds-text-secondary)]">
            Aster 的 Mac 界面复用 open-claude-ui 的 CDS 令牌、四套弹簧物理与 7 档滚动渐隐遮罩：陶土橙、四层暖灰表面、发丝边框与原生 Vibrancy 毛玻璃。
          </p>
          <button
            type="button"
            onClick={() => void window.aster.app.openExternal('https://github.com/Caho1/open-claude-ui')}
            className="mt-2 flex items-center gap-1 text-[10.5px] font-medium text-clay hover:underline"
          >
            查看设计系统
            <ExternalLink size={9} />
          </button>
        </div>
      </div>
    </div>
  )
}

function AboutSettings({ appInfo }: { appInfo: AppInfo | null }) {
  return (
    <div>
      <SectionHeader title="关于" description="Aster 的 macOS 原生桌面客户端。" />
      <div className="flex items-start gap-4">
        <div className="relative flex size-[64px] items-center justify-center rounded-2xl border border-[var(--cds-border)] bg-[var(--cds-surface-2)]">
          <AsterMark size={42} glow />
        </div>
        <div>
          <div className="font-serif text-[24px] font-medium tracking-[-0.03em]">Aster</div>
          <div className="mt-0.5 text-[11px] text-[var(--cds-text-muted)]">
            {appInfo ? `v${appInfo.version} · Electron ${appInfo.electron} · Chromium ${appInfo.chrome}` : '正在读取版本…'}
          </div>
          <p className="mt-3 max-w-[430px] text-[11.5px] leading-relaxed text-[var(--cds-text-secondary)]">
            一个安静、原生、可以长期使用的 AI 工作台。数据保存在本机，API 密钥通过 macOS 钥匙串加密。
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-0 border-t border-[var(--cds-border)]">
        <SettingRow title="数据目录" description={appInfo?.dataDir ?? ''}>
          <button
            type="button"
            onClick={() => void window.aster.app.openDataDir()}
            className="flex h-7 items-center gap-1.5 rounded-lg border border-[var(--cds-border)] px-2.5 text-[10.5px] font-medium text-[var(--cds-text-secondary)] transition-colors hover:border-clay/40 hover:text-clay"
          >
            <FolderOpen size={11} />
            打开
          </button>
        </SettingRow>
        <SettingRow title="项目主页" description="Aster 主仓库与更新记录。">
          <button
            type="button"
            onClick={() => void window.aster.app.openExternal('https://github.com/adongshaln/Aster')}
            className="flex h-7 items-center gap-1.5 rounded-lg border border-[var(--cds-border)] px-2.5 text-[10.5px] font-medium text-[var(--cds-text-secondary)] transition-colors hover:border-clay/40 hover:text-clay"
          >
            <ExternalLink size={11} />
            GitHub
          </button>
        </SettingRow>
        <SettingRow title="界面参考" description="open-claude-ui · Claude Design System (MIT)">
          <button
            type="button"
            onClick={() => void window.aster.app.openExternal('https://github.com/Caho1/open-claude-ui')}
            className="flex h-7 items-center gap-1.5 rounded-lg border border-[var(--cds-border)] px-2.5 text-[10.5px] font-medium text-[var(--cds-text-secondary)] transition-colors hover:border-clay/40 hover:text-clay"
          >
            <ExternalLink size={11} />
            查看
          </button>
        </SettingRow>
      </div>
    </div>
  )
}
