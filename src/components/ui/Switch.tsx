import { cn } from '@/lib/utils'

export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-40',
        checked ? 'bg-clay' : 'bg-[var(--cds-border-strong)]',
      )}
    >
      <span
        className={cn(
          'inline-block size-[18px] rounded-full bg-white shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.2,0.9,0.25,1)]',
          checked ? 'translate-x-[18px]' : 'translate-x-[2px]',
        )}
      />
    </button>
  )
}
