import { ImagePlus, Loader2, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Profile } from '@shared/types'
import { IconButton } from '@/components/ui/IconButton'
import { Modal } from '@/components/ui/Modal'
import { CdsSelect, ModelAutocompleteField } from '@/components/ui/Select'
import { useAppStore, activeProfile } from '@/state/store'
import { cn } from '@/lib/utils'

const SIZES = [
  { id: '1024x1024', label: '方形 1024' },
  { id: '1536x1024', label: '横向 1536×1024' },
  { id: '1024x1536', label: '纵向 1024×1536' },
  { id: '512x512', label: '小图 512' },
]

function suggestedModel(profile: Profile | undefined): string {
  if (!profile) return ''
  const preferred = profile.models.find(model => /image|dall-e|flux|diffusion|stable/i.test(model.id))
  return preferred?.id || profile.chatModel || profile.models[0]?.id || ''
}

export function ImageDialog() {
  const open = useAppStore(state => state.imageOpen)
  const close = useAppStore(state => state.closeImage)
  const profile = useAppStore(activeProfile)
  const generate = useAppStore(state => state.generateImage)
  const showToast = useAppStore(state => state.showToast)
  const openSettings = useAppStore(state => state.openSettings)

  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('')
  const [size, setSize] = useState('1024x1024')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wasOpen, setWasOpen] = useState(false)

  const fallback = useMemo(() => suggestedModel(profile), [profile])

  useEffect(() => {
    if (open && !wasOpen) {
      setPrompt('')
      setModel(fallback)
      setSize('1024x1024')
      setError('')
      setBusy(false)
    }
    setWasOpen(open)
  }, [open, wasOpen, fallback])

  const submit = async () => {
    if (busy) return
    if (!profile) {
      setError('请先在设置中配置模型服务')
      return
    }
    if (!prompt.trim()) {
      setError('请输入图片提示词')
      return
    }
    setBusy(true)
    setError('')
    try {
      const count = await generate(prompt, model || fallback, size)
      showToast(`已生成 ${count} 张图片`, 'success')
      close()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={close} width={600} className="outline-none">
      <div className="overflow-hidden rounded-[18px] border border-[var(--cds-border)] bg-[var(--cds-surface-1)] shadow-popover">
        <header className="flex items-center gap-3 border-b border-[var(--cds-border)] px-5 py-4">
          <div className="flex size-9 items-center justify-center rounded-[10px] bg-clay/10 text-clay">
            <ImagePlus size={17} />
          </div>
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold tracking-[-0.01em]">生成图片</h1>
            <p className="mt-0.5 text-[11px] text-[var(--cds-text-muted)]">
              结果会保存到本机附件目录，并插入当前对话
            </p>
          </div>
          <IconButton title="关闭" onClick={close} className="ml-auto">
            <X size={14} />
          </IconButton>
        </header>

        <div className="px-5 py-4">
          <label className="cds-label">提示词</label>
          <textarea
            value={prompt}
            onChange={event => setPrompt(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                void submit()
              }
            }}
            placeholder="描述画面、风格、光线与构图，例如：陶土色的晨光房间，一只橘猫趴在窗台，胶片质感"
            className="cds-input cds-textarea scroll-quiet min-h-[112px] resize-none text-[12.5px] leading-relaxed"
            autoFocus
          />

          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_180px] gap-3">
            <div>
              <label className="cds-label">模型</label>
              <ModelAutocompleteField
                value={model}
                models={profile?.models ?? []}
                onChange={setModel}
                placeholder={fallback || '例如 gpt-image-1'}
              />
            </div>
            <div>
              <label className="cds-label">尺寸</label>
              <CdsSelect
                value={size}
                options={SIZES.map(opt => ({ value: opt.id, label: opt.label }))}
                onChange={setSize}
              />
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 text-[10.5px] text-[var(--cds-text-muted)]">
            <Sparkles size={11} className="text-clay" />
            {profile ? (
              <span>
                当前服务 <span className="font-medium text-[var(--cds-text-secondary)]">{profile.name}</span>
                <span className="mx-1 opacity-40">·</span>
                {profile.imageApiMode === 'auto' ? '自动选择协议' : profile.imageApiMode === 'gemini' ? 'Gemini 多模态' : 'OpenAI Images'}
                <span className="mx-1 opacity-40">·</span>
                ⌘ Enter 生成
              </span>
            ) : (
              <button type="button" onClick={() => openSettings('services')} className="text-clay hover:underline">
                先去配置一个模型服务
              </button>
            )}
          </div>

          {error && (
            <div className="mt-3 whitespace-pre-wrap break-words rounded-[10px] border border-red-500/20 bg-red-500/[0.05] px-3 py-2.5 text-[11.5px] leading-relaxed text-red-500">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--cds-border)] px-5 py-3.5">
          <button
            type="button"
            onClick={close}
            className="h-8 rounded-lg px-3 text-[12px] font-medium text-[var(--cds-text-secondary)] transition-colors hover:bg-[var(--cds-fill-ghost-hover)]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !profile || !prompt.trim()}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-[12px] font-semibold text-white transition-all active:scale-[0.97]',
              busy || !profile || !prompt.trim() ? 'cursor-default bg-clay/40' : 'bg-clay hover:bg-clay-hover',
            )}
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
            {busy ? '生成中…' : '生成'}
          </button>
        </footer>
      </div>
    </Modal>
  )
}
