import { AlertTriangle } from 'lucide-react'
import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { motionModalDialog } from '@/lib/motion'
import { cn } from '@/lib/utils'

export function Modal({
  open,
  onClose,
  children,
  width = 470,
  className,
  label = '对话框',
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  width?: number
  className?: string
  label?: string
}) {
  const panel = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)
  const headingId = useId()
  const reducedMotion = useReducedMotion()
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  if (open && !wasOpen.current) previousFocus.current = document.activeElement as HTMLElement
  wasOpen.current = open
  useLayoutEffect(() => {
    if (!open) return
    const root = document.getElementById('root')
    const wasInert = root?.inert ?? false
    if (root) root.inert = true
    const dialog = panel.current!
    const heading = dialog.querySelector('h1,h2,h3')
    if (heading) { heading.id ||= headingId; dialog.setAttribute('aria-labelledby', heading.id) }
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(item => item.getClientRects().length > 0 && !item.closest('[inert]'))
    const focusFirst = () => (focusable()[0] ?? dialog).focus()
    if (!dialog.contains(document.activeElement)) focusFirst()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (dialog.querySelector('[data-popover="true"]')) return
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
      } else if (event.key === 'Tab') {
        const items = focusable()
        const first = items[0] ?? dialog
        const last = items.at(-1) ?? dialog
        if (!items.length || !dialog.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
          event.preventDefault()
          ;(event.shiftKey ? last : first).focus()
        }
      }
    }
    const onFocus = (event: FocusEvent) => { if (!dialog.contains(event.target as Node)) focusFirst() }
    window.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('focusin', onFocus)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('focusin', onFocus)
      if (root) root.inert = wasInert
      if (previousFocus.current?.isConnected) previousFocus.current.focus()
    }
  }, [open, headingId])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="modal-backdrop fixed inset-0 z-[90] flex items-center justify-center bg-black/[0.32] p-6 dark:bg-black/55"
      onClick={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        variants={reducedMotion ? undefined : motionModalDialog}
        initial={reducedMotion ? false : 'initial'}
        animate="animate"
        style={{ width }}
        className={cn('relative z-10 max-w-full outline-none', className)}
      >
        {children}
      </motion.div>
    </div>,
    document.body,
  )
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '删除',
  cancelLabel = '取消',
  danger = true,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="overflow-hidden rounded-2xl border border-[var(--cds-border)] bg-[var(--cds-surface-popover)] shadow-popover">
        <div className="px-5 pb-2 pt-5">
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${
                danger ? 'bg-red-500/10 text-red-500' : 'bg-clay/10 text-clay'
              }`}
            >
              <AlertTriangle size={16} />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
              {description && (
                <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--cds-text-secondary)]">
                  {description}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-lg px-3 text-[12.5px] font-medium text-[var(--cds-text-secondary)] transition-colors hover:bg-[var(--cds-fill-ghost-hover)]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`h-8 rounded-lg px-3 text-[12.5px] font-semibold text-white transition-all active:scale-[0.97] ${
              danger ? 'bg-red-500 hover:bg-red-600' : 'bg-clay hover:bg-clay-hover'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
