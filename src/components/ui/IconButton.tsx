import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'ghost' | 'soft' | 'solid' | 'clay'
type Size = 'xs' | 'sm' | 'md'

const sizes: Record<Size, string> = {
  xs: 'size-6 rounded-md',
  sm: 'size-7 rounded-lg',
  md: 'size-8 rounded-lg',
}

const variants: Record<Variant, string> = {
  ghost: 'text-[var(--cds-text-secondary)] hover:bg-[var(--cds-fill-ghost-hover)] hover:text-[var(--cds-text-primary)]',
  soft: 'bg-[var(--cds-fill-secondary)] text-[var(--cds-text-primary)] hover:bg-[var(--cds-fill-secondary-hover)]',
  solid: 'bg-[var(--cds-text-primary)] text-[var(--cds-surface-1)] hover:opacity-90',
  clay: 'bg-clay text-white hover:bg-clay-hover shadow-sm',
}

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
}>(function IconButton({ className, variant = 'ghost', size = 'sm', type = 'button', ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center transition-all duration-150 active:scale-[0.94] disabled:pointer-events-none disabled:opacity-40',
        sizes[size],
        variants[variant],
        className,
      )}
      {...props}
    />
  )
})
