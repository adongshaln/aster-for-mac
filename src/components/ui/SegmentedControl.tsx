import { cn } from '@/lib/utils'

interface SegmentedControlProps<T extends string> {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  className?: string
  size?: 'sm' | 'md'
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className,
  size = 'md',
}: SegmentedControlProps<T>) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full bg-[var(--cds-segmented-track)] p-[2px]',
        size === 'sm' ? 'h-7' : 'h-8',
        className,
      )}
    >
      {options.map(option => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'relative flex h-full items-center justify-center rounded-full transition-all duration-150',
              size === 'sm' ? 'px-2.5 text-[11px]' : 'px-3 text-[12px]',
              active
                ? 'bg-[var(--cds-segmented-thumb)] text-[var(--cds-text-primary)] shadow-sm'
                : 'text-[var(--cds-text-secondary)] hover:text-[var(--cds-text-primary)]',
            )}
          >
            <span className="relative z-10 whitespace-nowrap font-medium">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
