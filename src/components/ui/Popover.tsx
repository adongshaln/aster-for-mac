import { useEffect, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface PopoverProps {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  children: ReactNode
  width?: number
  side?: 'top' | 'bottom'
  align?: 'start' | 'end' | 'center'
  className?: string
  offset?: number
}

export function Popover({
  open,
  onClose,
  anchorRef,
  children,
  width = 320,
  side = 'bottom',
  align = 'start',
  className,
  offset = 8,
}: PopoverProps) {
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!open) return
    const refresh = () => setTick(value => value + 1)
    window.addEventListener('resize', refresh)
    window.addEventListener('scroll', refresh, true)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('resize', refresh)
      window.removeEventListener('scroll', refresh, true)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null
  const anchor = anchorRef.current
  if (!anchor) return null
  const rect = anchor.getBoundingClientRect()
  width = Math.min(width, window.innerWidth - 20)
  const margin = 10
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  let left =
    align === 'end'
      ? rect.right - width
      : align === 'center'
        ? rect.left + rect.width / 2 - width / 2
        : rect.left
  left = Math.max(margin, Math.min(left, viewportWidth - width - margin))

  const below = viewportHeight - rect.bottom - margin
  const placeAbove = side === 'top' || (side === 'bottom' && below < 220 && rect.top > below)
  const placement = placeAbove
    ? { bottom: viewportHeight - rect.top + offset }
    : { top: rect.bottom + offset }

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[100]"
        onClick={event => {
          if (event.target === event.currentTarget) onClose()
        }}
      />
      <div
        data-popover="true"
        style={{
          position: 'fixed',
          left,
          width,
          ...placement,
          zIndex: 101,
        }}
        className={cn(
          'popover-panel max-h-[min(72vh,560px)] overflow-hidden rounded-xl border border-[var(--cds-border)] bg-[var(--cds-surface-popover)] shadow-popover',
          className,
        )}
      >
        {children}
      </div>
    </>,
    anchor.closest('[role="dialog"]') ?? document.body,
  )
}
