import { ChevronDown } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Popover } from '@/components/ui/Popover'
import { useAppStore, activeConversation, activeProfile } from '@/state/store'
import {
  DEFAULT_REASONING,
  EFFORT_RANK,
  reasoningChoices,
  reasoningLabel,
  type ReasoningChoice,
} from '@shared/reasoning'
import { cn } from '@/lib/utils'

/**
 * Deterministic 32-bit integer hash ported from `Nwflower/dsh-claude-style` (`t5`).
 */
function matrixHash(row: number, col: number, salt: number): number {
  let h =
    Math.imul(row + 1, -1640531535) ^
    Math.imul(col + 1, -2048144789) ^
    Math.imul(salt + 1, 668265263)
  h = Math.imul(h ^ (h >>> 15), 625341585)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

function smoothStep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function matrixBaseOpacity(colNorm: number): number {
  if (colNorm <= 0.05) return 0
  if (colNorm >= 0.75) return 1
  const a = (colNorm - 0.05) / 0.7
  return a * a * (3 - 2 * a)
}

function matrixFlowStrength(row: number, col: number, colNorm: number): number {
  const bucket = Math.min(8, Math.floor(colNorm * 9))
  const g = matrixHash(bucket, row, 6)
  const c = matrixHash(row, col, 7)
  const v = g * 0.4 + c * 0.6
  return 0.04 + smoothStep(0.46, 0.58, v) * 0.92
}

/**
 * Compute effort accent tint percentage (`--dsh-claude-effort-tint` in `dsh-claude-style`).
 * Returns `null` for `default`, `none`, `off`.
 */
function effortTintRatio(levels: ReasoningChoice[], index: number): number | null {
  if (index < 0 || index >= levels.length) return null
  const choice = levels[index]
  const rank = EFFORT_RANK[choice.id] ?? 0
  if (rank <= 0) return null
  const active = levels.filter(l => (EFFORT_RANK[l.id] ?? 0) > 0)
  const activeIdx = active.findIndex(l => l.id === choice.id)
  if (activeIdx < 0) return null
  return active.length < 2 ? 1 : activeIdx / (active.length - 1)
}

function effortTintStyle(ratio: number | null): React.CSSProperties | undefined {
  if (ratio === null) return undefined
  const pct = Math.round(ratio * 100)
  return {
    color: `color-mix(in oklch, var(--cds-clay) ${62 + Math.round(pct * 0.34)}%, var(--cds-text-primary))`,
  }
}

export function ReasoningPicker({ compact = false }: { compact?: boolean }) {
  const profile = useAppStore(activeProfile)
  const conversation = useAppStore(activeConversation)
  const chooseEffort = useAppStore(state => state.chooseEffort)
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const model = conversation?.model || profile?.chatModel || ''
  const choices = useMemo(() => reasoningChoices(model), [model])
  const levels = useMemo(() => choices.filter(c => c.id !== DEFAULT_REASONING), [choices])
  if (!levels.length) return null

  const effort = profile?.reasoningEffort ?? DEFAULT_REASONING
  const isAuto = effort === DEFAULT_REASONING || !levels.some(l => l.id === effort)
  const selectedIndex = isAuto
    ? Math.floor((levels.length - 1) / 2)
    : Math.max(0, levels.findIndex(l => l.id === effort))
  const triggerRatio = isAuto ? null : effortTintRatio(levels, selectedIndex)
  const triggerLabel = isAuto ? '自动' : reasoningLabel(model, effort)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(value => !value)}
        style={effortTintStyle(triggerRatio)}
        className={cn(
          'flex h-8 items-center gap-1 rounded-[8px] px-2 text-[12px] font-medium transition-all duration-150 hover:bg-[var(--cds-fill-ghost-hover)] active:scale-[0.97]',
          triggerRatio === null && 'text-[var(--cds-text-secondary)] hover:text-[var(--cds-text-primary)]',
          compact && 'h-7 px-2',
        )}
        title="推理等级（Reasoning Effort）"
      >
        <span className="max-w-[92px] truncate">{triggerLabel}</span>
        <ChevronDown size={11} className={cn('opacity-60 transition-transform duration-150', open && 'rotate-180')} />
      </button>

      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        width={292}
        side="top"
        className="p-2.5"
      >
        <DshEffortSlider
          model={model}
          levels={levels}
          effort={effort}
          onPick={next => void chooseEffort(next)}
        />
      </Popover>
    </>
  )
}

function DshEffortSlider({
  model,
  levels,
  effort,
  onPick,
}: {
  model: string
  levels: ReasoningChoice[]
  effort: string
  onPick: (effortId: string) => void
}) {
  const isAuto = effort === DEFAULT_REASONING || !levels.some(l => l.id === effort)
  const committedIndex = isAuto
    ? Math.floor((levels.length - 1) / 2)
    : Math.max(0, levels.findIndex(l => l.id === effort))

  const [dragging, setDragging] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(committedIndex)
  const [positionFrac, setPositionFrac] = useState(
    levels.length > 1 ? committedIndex / (levels.length - 1) : 1,
  )
  const [swapDir, setSwapDir] = useState<1 | -1>(1)
  const trackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!dragging) {
      setPreviewIndex(committedIndex)
      setPositionFrac(levels.length > 1 ? committedIndex / (levels.length - 1) : 1)
    }
  }, [committedIndex, levels.length, dragging, model])

  const activeIndex = dragging ? previewIndex : committedIndex
  const isApex = (!isAuto || dragging) && levels.length > 1 && activeIndex === levels.length - 1
  const currentChoice = levels[activeIndex] ?? levels[0]
  const displayValue = isAuto && !dragging ? '自动（默认）' : currentChoice.label
  const tintRatio = isAuto && !dragging ? null : effortTintRatio(levels, activeIndex)

  const cols = 38
  const rows = 5
  const matrixCells = useMemo(() => {
    const list: Array<{
      key: string
      opacity: number
      flashDelay: string
      flashDur: string
      flowDelay: string
      flowStrength: string
    }> = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = cols > 1 ? c / (cols - 1) : 1
        const op = matrixBaseOpacity(v)
        const flashDelay = `${(matrixHash(r, c, 2) * 1.45 * 0.95 + 1.45 * 0.21).toFixed(3)}s`
        const flashDur = `${(1.45 * (0.92 + matrixHash(r, c, 3) * 0.16)).toFixed(3)}s`
        const flowDelay = `-${(v * 4.0 + r * 4.0 * 0.03 + matrixHash(r, c, 5) * 4.0 * 0.05).toFixed(3)}s`
        const flowStrength = matrixFlowStrength(r, c, v).toFixed(3)
        list.push({
          key: `${r}-${c}`,
          opacity: op,
          flashDelay,
          flashDur,
          flowDelay,
          flowStrength,
        })
      }
    }
    return list
  }, [])

  const updateFromClientX = (clientX: number, commitOnEnd = false) => {
    const track = trackRef.current
    if (!track || levels.length === 0) return
    const rect = track.getBoundingClientRect()
    const knobSize = 16
    const span = Math.max(1, rect.width - knobSize)
    const rawX = Math.max(0, Math.min(span, clientX - rect.left - knobSize / 2))
    const rawNorm = rawX / span
    const maxStep = Math.max(1, levels.length - 1)
    const stepPos = rawNorm * maxStep
    const stepBase = Math.floor(stepPos)
    const frac = stepPos - stepBase
    // Magnetic sin snap (`Y(J)` in dsh-claude-style)
    const magneticStep =
      stepBase >= maxStep
        ? maxStep
        : stepBase + frac - (0.65 * Math.sin(2 * Math.PI * frac)) / (2 * Math.PI)
    const nearest = Math.max(0, Math.min(maxStep, Math.round(rawNorm * maxStep)))
    if (nearest !== previewIndex) {
      setSwapDir(nearest >= previewIndex ? 1 : -1)
      setPreviewIndex(nearest)
    }
    setPositionFrac(commitOnEnd ? nearest / maxStep : Math.max(0, Math.min(1, magneticStep / maxStep)))
    if (commitOnEnd) {
      const picked = levels[nearest]
      if (picked) onPick(picked.id)
    }
  }

  return (
    <div className="flex select-none flex-col gap-1 px-1 py-0.5">
      {/* 1. Header row: `.dsh-claude-effort-head` */}
      <div className="flex items-baseline gap-1.5">
        <span className="text-[12.5px] text-[var(--cds-text-secondary)]">推理等级</span>
        <span
          key={displayValue}
          style={effortTintStyle(tintRatio)}
          className={cn(
            'inline-block truncate text-[12.5px] font-semibold transition-all duration-150',
            tintRatio === null && 'text-[var(--cds-text-primary)]',
            swapDir > 0 ? 'animate-in fade-in slide-in-from-bottom-1' : 'animate-in fade-in slide-in-from-top-1',
          )}
        >
          {displayValue}
        </span>
        {!isAuto && (
          <button
            type="button"
            onClick={() => onPick(DEFAULT_REASONING)}
            className="ml-auto rounded px-1.5 py-0.5 text-[10.5px] text-[var(--cds-text-muted)] transition-colors hover:bg-[var(--cds-fill-ghost-hover)] hover:text-[var(--cds-text-primary)]"
          >
            默认
          </button>
        )}
      </div>

      {/* 2. Scale ends row: `.dsh-claude-effort-ends` */}
      <div className="flex items-center justify-between text-[10.5px] leading-[14px] text-[var(--cds-text-muted)]">
        <span>更快</span>
        <span>更强</span>
      </div>

      {/* 3. Track + Fill + Ticks + Apex Matrix + 16x30 Knob: `.dsh-claude-effort-track` */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="推理等级"
        aria-valuemin={0}
        aria-valuemax={levels.length - 1}
        aria-valuenow={activeIndex}
        aria-valuetext={currentChoice?.label ?? ''}
        onPointerDown={event => {
          if (event.button !== 0) return
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          setDragging(true)
          updateFromClientX(event.clientX, false)
        }}
        onPointerMove={event => {
          if (!dragging) return
          updateFromClientX(event.clientX, false)
        }}
        onPointerUp={event => {
          if (!dragging) return
          setDragging(false)
          updateFromClientX(event.clientX, true)
        }}
        onPointerCancel={() => {
          if (!dragging) return
          setDragging(false)
          setPositionFrac(levels.length > 1 ? committedIndex / (levels.length - 1) : 1)
        }}
        onKeyDown={event => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
            event.preventDefault()
            const next = Math.max(0, activeIndex - 1)
            setSwapDir(-1)
            onPick(levels[next].id)
          } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
            event.preventDefault()
            const next = Math.min(levels.length - 1, activeIndex + 1)
            setSwapDir(1)
            onPick(levels[next].id)
          }
        }}
        className="relative mt-0.5 h-[30px] cursor-pointer touch-none outline-none"
      >
        {/* Track Background (`26px` tall, `8px` radius) */}
        <div className="absolute inset-x-0 top-1/2 -mt-[13px] h-[26px] overflow-hidden rounded-[8px] bg-black/[0.075] dark:bg-white/[0.10]">
          {/* Fill Bar */}
          {(!isAuto || dragging) && !isApex && (
            <div
              className={cn(
                'pointer-events-none absolute inset-y-0 left-0 rounded-l-[8px] bg-[var(--cds-text-primary)] opacity-[0.22]',
                !dragging && 'transition-[width] duration-200 ease-[cubic-bezier(0.22,0.61,0.36,1)]',
              )}
              style={{ width: `calc(${positionFrac * 100}% + 8px)` }}
            />
          )}

          {/* Step Ticks (`4px` dots) */}
          {!isApex && (
            <div className="pointer-events-none absolute inset-0">
              {levels.map((lvl, idx) => {
                const frac = levels.length > 1 ? idx / (levels.length - 1) : 0.5
                return (
                  <span
                    key={lvl.id}
                    className="absolute top-1/2 -mt-[2px] size-[4px] -translate-x-1/2 rounded-full bg-[var(--cds-text-primary)] opacity-[0.26]"
                    style={{ left: `calc(8px + (100% - 16px) * ${frac})` }}
                  />
                )
              })}
            </div>
          )}

          {/* Apex 5-Row Pixel Dot Matrix (`.dsh-claude-effort-matrix`) */}
          {isApex && (
            <div
              className="pointer-events-none absolute inset-0 grid items-center justify-center gap-[1px] px-[2px] py-[2px]"
              style={{
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gridTemplateRows: `repeat(${rows}, 1fr)`,
              }}
            >
              {matrixCells.map(cell => (
                <div
                  key={cell.key}
                  className="dsh-apex-sq size-full rounded-[1px]"
                  style={
                    {
                      opacity: cell.opacity,
                      '--dsh-flash-delay': cell.flashDelay,
                      '--dsh-flash-dur': cell.flashDur,
                      '--dsh-flow-delay': cell.flowDelay,
                      '--dsh-flow-strength': cell.flowStrength,
                    } as React.CSSProperties
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* Rectangular Knob (`16px x 30px`, `border-radius: 5px`, `scale: 1.1` when dragging) */}
        <div
          className={cn(
            'pointer-events-none absolute top-1/2 -mt-[15px] h-[30px] w-[16px] rounded-[5px] bg-white',
            !dragging && 'transition-[left,transform,box-shadow,background-color] duration-200 ease-[cubic-bezier(0.22,0.61,0.36,1)]',
            dragging && 'scale-110',
            isApex
              ? 'bg-[#f8ede9] shadow-[0_0_10px_rgba(217,119,87,0.82),0_0_0_1px_rgba(217,119,87,0.45)]'
              : 'shadow-[0_1px_3px_rgba(20,20,19,0.28),0_0_0_1px_rgba(20,20,19,0.08)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.55),0_0_0_1px_rgba(0,0,0,0.4)]',
          )}
          style={{
            left: `calc((100% - 16px) * ${positionFrac})`,
          }}
        />
      </div>

      {/* 4. Hint line */}
      <div className="mt-1 flex items-center justify-between border-t border-[var(--cds-border)] pt-1.5 text-[10px] text-[var(--cds-text-muted)]">
        <span className="truncate">{currentChoice?.hint || '按模型家族写入对应的推理参数'}</span>
        <span className="ml-2 shrink-0 font-mono opacity-75">{model.split('/').pop()}</span>
      </div>
    </div>
  )
}
