import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { useAppStore } from '@/state/store'

export function Toast() {
  const toast = useAppStore(state => state.toast)
  const dismiss = useAppStore(state => state.dismissToast)

  if (!toast) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[120] flex justify-center px-6">
      <button
        key={toast.id}
        type="button"
        onClick={dismiss}
        className="modal-panel pointer-events-auto flex max-w-[520px] items-center gap-2 rounded-full border border-[var(--cds-border)] bg-[var(--cds-surface-popover)] px-3.5 py-2 text-[12.5px] font-medium shadow-popover"
      >
        {toast.kind === 'error' ? (
          <AlertCircle size={14} className="shrink-0 text-red-500" />
        ) : toast.kind === 'success' ? (
          <CheckCircle2 size={14} className="shrink-0 text-emerald-500" />
        ) : (
          <Info size={14} className="shrink-0 text-clay" />
        )}
        <span className="truncate text-[var(--cds-text-primary)]">{toast.message}</span>
      </button>
    </div>
  )
}
