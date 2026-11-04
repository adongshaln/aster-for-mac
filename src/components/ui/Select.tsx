import { Check, ChevronDown, Search, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Popover } from '@/components/ui/Popover'
import type { ModelInfo } from '@shared/types'
import { cn } from '@/lib/utils'

export interface SelectOption<T extends string = string> {
  value: T
  label: string
  hint?: string
}

/**
 * Custom CDS-styled Select component replacing native macOS `<select>` so every dropdown
 * matches the warm paper-and-ink popover aesthetic.
 */
export function CdsSelect<T extends string = string>({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = '请选择',
  className,
}: {
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const selected = options.find(opt => opt.value === value) ?? options[0]

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        className={cn(
          'cds-input flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50',
          open && 'border-clay shadow-[0_0_0_3px_rgba(217,119,87,0.12)]',
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate text-[12.5px]">
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={13}
          className={cn(
            'shrink-0 text-[var(--cds-text-muted)] transition-transform duration-150',
            open && 'rotate-180',
          )}
        />
      </button>

      <Popover
        open={open && !disabled}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        width={Math.max(220, triggerRef.current?.offsetWidth ?? 240)}
        side="bottom"
        className="p-1"
      >
        <div className="scroll-quiet max-h-[260px] overflow-y-auto">
          {options.map(option => {
            const active = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors',
                  active
                    ? 'bg-clay/10 text-clay'
                    : 'text-[var(--cds-text-primary)] hover:bg-[var(--cds-fill-ghost-hover)]',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-medium">{option.label}</div>
                  {option.hint && (
                    <div className="mt-0.5 truncate text-[10.5px] text-[var(--cds-text-muted)]">
                      {option.hint}
                    </div>
                  )}
                </div>
                {active && <Check size={13} className="shrink-0 text-clay" />}
              </button>
            )
          })}
        </div>
      </Popover>
    </>
  )
}

/**
 * Custom searchable Model Combobox replacing native `<input list="...">` + `<datalist>`.
 * Shows ALL fetched models (with instant keyword filter + manual input), never truncating at 5 items
 * or filtering out models when a default model is already selected.
 */
export function ModelAutocompleteField({
  value,
  models,
  onChange,
  placeholder = '拉取模型后选择或直接输入',
}: {
  value: string
  models: ModelInfo[]
  onChange: (next: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const anchorRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const filteredModels = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return models
    return models.filter(
      m => m.id.toLowerCase().includes(q) || (m.ownedBy && m.ownedBy.toLowerCase().includes(q)),
    )
  }, [models, filter])

  return (
    <>
      <div ref={anchorRef} className="relative flex items-center">
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => {
            if (models.length > 0) setOpen(true)
          }}
          placeholder={placeholder}
          spellCheck={false}
          className="cds-input pr-8 font-mono text-[12px]"
        />
        <button
          type="button"
          onClick={() => {
            setFilter('')
            setOpen(v => !v)
            setTimeout(() => searchInputRef.current?.focus(), 20)
          }}
          className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-[var(--cds-text-muted)] transition-colors hover:bg-[var(--cds-fill-ghost-hover)] hover:text-[var(--cds-text-primary)]"
          title={models.length ? `浏览全部 ${models.length} 个模型` : '输入或拉取模型'}
        >
          <ChevronDown size={13} className={cn('transition-transform duration-150', open && 'rotate-180')} />
        </button>
      </div>

      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        width={Math.max(320, anchorRef.current?.offsetWidth ?? 320)}
        side="bottom"
        className="p-0"
      >
        <div className="flex items-center gap-2 border-b border-[var(--cds-border)] px-3 py-2">
          <Search size={12.5} className="shrink-0 text-[var(--cds-text-muted)]" />
          <input
            ref={searchInputRef}
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder={`在全部 ${models.length} 个模型中搜索…`}
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent font-mono text-[11.5px] text-[var(--cds-text-primary)] outline-none placeholder:font-sans placeholder:text-[var(--cds-text-muted)]"
          />
          {filter && (
            <button
              type="button"
              onClick={() => setFilter('')}
              className="rounded p-0.5 text-[var(--cds-text-muted)] hover:text-[var(--cds-text-primary)]"
            >
              <X size={11} />
            </button>
          )}
          <span className="shrink-0 rounded bg-black/[0.04] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[var(--cds-text-muted)] dark:bg-white/[0.06]">
            {filteredModels.length}/{models.length}
          </span>
        </div>

        <div className="scroll-quiet max-h-[260px] overflow-y-auto p-1">
          {models.length === 0 ? (
            <div className="px-3 py-6 text-center text-[11.5px] text-[var(--cds-text-muted)]">
              尚未拉取到模型列表，请点击下方「测试并拉取模型」或直接在输入框填写模型 ID
            </div>
          ) : filteredModels.length === 0 ? (
            <div className="px-3 py-5 text-center text-[11.5px] text-[var(--cds-text-muted)]">
              没有匹配「{filter}」的模型，可直接点击使用：
              <button
                type="button"
                onClick={() => {
                  onChange(filter.trim())
                  setOpen(false)
                }}
                className="mt-1.5 block w-full rounded-lg bg-clay/10 py-1.5 font-mono text-[11.5px] font-semibold text-clay"
              >
                使用 &ldquo;{filter.trim()}&rdquo;
              </button>
            </div>
          ) : (
            filteredModels.map(item => {
              const active = item.id === value
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onChange(item.id)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors',
                    active
                      ? 'bg-clay/10 text-clay'
                      : 'text-[var(--cds-text-primary)] hover:bg-[var(--cds-fill-ghost-hover)]',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[11.5px] font-medium">{item.id}</div>
                    {item.ownedBy && (
                      <div className="truncate text-[9.5px] text-[var(--cds-text-muted)]">{item.ownedBy}</div>
                    )}
                  </div>
                  {active && <Check size={12.5} className="shrink-0 text-clay" />}
                </button>
              )
            })
          )}
        </div>
      </Popover>
    </>
  )
}
