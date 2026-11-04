import { AlertTriangle } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

export function Modal({
  open,
  onClose,
  children,
  width = 470,
  className,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  width?: number
  className?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="modal-backdrop fixed inset-0 z-[90] flex items-center justify-center bg-black/32 p-6 dark:bg-black/55"
      onClick={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        style={{ width }}
        className={cn('modal-panel relative z-10 max-w-full', className)}
      >
        {children}
      </div>
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
