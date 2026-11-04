import { BarChart3, BookOpen, Clock, Sparkles, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { IconButton } from '@/components/ui/IconButton'
import { Modal } from '@/components/ui/Modal'
import { useAppStore } from '@/state/store'
import {
  compactTokens,
  formatCurrencyCost,
  formatPercent,
  isDeepSeekPeakNow,
  summarizeUsage,
  type UsageRange,
} from '@/lib/usage'
import type { BillingCurrency } from '@shared/types'
import { cn } from '@/lib/utils'

const MODEL_SWATCHES = ['#3b6ecf', '#d97757', '#3d7550', '#9748ec', '#a4621d', '#70686a']

function formatTime(ms: number): string {
  const date = new Date(ms)
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${month}/${day} ${hour}:${minute}`
}

export function UsageDialog() {
  const open = useAppStore(state => state.usageOpen)
  const close = useAppStore(state => state.closeUsage)
  const conversations = useAppStore(state => state.conversations)
  const settings = useAppStore(state => state.config?.settings)
  const updateSettings = useAppStore(state => state.updateSettings)
  const selectConversation = useAppStore(state => state.selectConversation)

  const [tab, setTab] = useState<'overview' | 'models'>('overview')
  const [range, setRange] = useState<UsageRange>('all')
  const [hoverCell, setHoverCell] = useState<{ label: string; tokens: number } | null>(null)
  const [showAllModels, setShowAllModels] = useState(false)

  const currency: BillingCurrency = settings?.billingCurrency ?? 'CNY'
  const summary = useMemo(() => summarizeUsage(conversations, range), [conversations, range])
  const peakState = useMemo(() => isDeepSeekPeakNow(), [])
  const maxDay = Math.max(1, ...summary.days.map(day => day.total))
  const empty = summary.requests === 0

  const openConversation = (id: string) => {
    selectConversation(id)
    close()
  }

  return (
    <Modal open={open} onClose={close} width={920} className="outline-none">
      <div className="flex max-h-[min(720px,calc(100vh-48px))] flex-col overflow-hidden rounded-[18px] border border-[var(--cds-border)] bg-[var(--cds-surface-1)] shadow-popover">
        {/* Top bar */}
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--cds-border)] px-6 py-3.5">
          <div className="flex size-8 items-center justify-center rounded-[9px] bg-clay/10 text-clay">
            <BarChart3 size={16} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[14.5px] font-semibold tracking-[-0.01em]">用量与成本仪表盘</h1>
              <span
                title={peakState.detail}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  peakState.isPeak
                    ? 'bg-[#a4621d]/12 text-[#a4621d] dark:text-[#e2a45f]'
                    : 'bg-[#3d7550]/12 text-[#3d7550] dark:text-[#8cbf96]',
                )}
              >
                <Clock size={10} />
                DeepSeek {peakState.label}
              </span>
            </div>
            <p className="mt-0.5 text-[10.5px] text-[var(--cds-text-muted)]">
              复刻 dsh-claude-style 用量面板 · 含会话统计、16 周热力图、模型分布与谷峰计费估算
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Currency toggle */}
            <div className="flex items-center rounded-[8px] bg-[var(--cds-fill-ghost-hover)] p-0.5 text-[10.5px]">
              {(['CNY', 'USD', 'OFF'] as BillingCurrency[]).map(cur => (
                <button
                  key={cur}
                  type="button"
                  onClick={() => void updateSettings({ billingCurrency: cur })}
                  className={cn(
                    'rounded-[6px] px-2 py-1 font-medium transition-colors',
                    currency === cur
                      ? 'bg-[var(--cds-surface-2)] text-[var(--cds-text-primary)] shadow-sm'
                      : 'text-[var(--cds-text-muted)] hover:text-[var(--cds-text-primary)]',
                  )}
                >
                  {cur === 'CNY' ? '¥ CNY' : cur === 'USD' ? '$ USD' : '不计费'}
                </button>
              ))}
            </div>
            <IconButton title="关闭" onClick={close}>
              <X size={14} />
            </IconButton>
          </div>
        </header>

        {/* Sub-header: Overview / Models tabs on left, All / 30d / 7d range pills on right */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--cds-border)] bg-[var(--cds-surface-0)] px-6 py-2.5">
          <div className="flex items-center gap-1 rounded-[8px] bg-black/[0.04] p-0.5 dark:bg-white/[0.05]">
            <button
              type="button"
              onClick={() => setTab('overview')}
              className={cn(
                'rounded-[6px] px-3 py-1 text-[11.5px] font-medium transition-colors',
                tab === 'overview'
                  ? 'bg-[var(--cds-surface-2)] text-[var(--cds-text-primary)] shadow-sm'
                  : 'text-[var(--cds-text-secondary)] hover:text-[var(--cds-text-primary)]',
              )}
            >
              概览 (Overview)
            </button>
            <button
              type="button"
              onClick={() => setTab('models')}
              className={cn(
                'rounded-[6px] px-3 py-1 text-[11.5px] font-medium transition-colors',
                tab === 'models'
                  ? 'bg-[var(--cds-surface-2)] text-[var(--cds-text-primary)] shadow-sm'
                  : 'text-[var(--cds-text-secondary)] hover:text-[var(--cds-text-primary)]',
              )}
            >
              模型 (Models)
            </button>
          </div>

          <div className="flex items-center gap-1 rounded-[8px] bg-black/[0.04] p-0.5 dark:bg-white/[0.05]">
            {(
              [
                { id: 'all', label: '全部 (All)' },
                { id: '30d', label: '30 天' },
                { id: '7d', label: '7 天' },
              ] as Array<{ id: UsageRange; label: string }>
            ).map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setRange(item.id)}
                className={cn(
                  'rounded-[6px] px-2.5 py-1 text-[11px] font-medium transition-colors',
                  range === item.id
                    ? 'bg-[var(--cds-surface-2)] text-[var(--cds-text-primary)] shadow-sm'
                    : 'text-[var(--cds-text-secondary)] hover:text-[var(--cds-text-primary)]',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {empty ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center py-14 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-[var(--cds-fill-secondary)] text-[var(--cds-text-muted)]">
                <BarChart3 size={20} />
              </div>
              <h2 className="mt-4 text-[14px] font-semibold">所选时间范围内还没有用量记录</h2>
              <p className="mt-1.5 max-w-[340px] text-[12px] leading-relaxed text-[var(--cds-text-secondary)]">
                发起一次对话后，这里会以 dsh-claude-style 面板展示 6 项核心指标、文学尺标、热力图与模型费用。
              </p>
            </div>
          ) : tab === 'overview' ? (
            <div className="space-y-5">
              {/* 1. dsh-claude-style 3x2 Stat Grid (Sessions, Messages, Total tokens, Active days, Peak hour, Favorite model) */}
              <div className="grid grid-cols-3 gap-3">
                <DshStatTile
                  label="会话数 · Sessions"
                  value={String(summary.sessions)}
                  sub={
                    currency !== 'OFF'
                      ? `累计估算 ${formatCurrencyCost(summary.totalCostCny, summary.totalCostUsd, currency)}`
                      : '已保存对话'
                  }
                />
                <DshStatTile
                  label="消息调用 · Messages"
                  value={String(summary.requests)}
                  sub={`缓存命中 ${formatPercent(summary.cacheRate)}`}
                />
                <DshStatTile
                  label="总 Tokens · Total tokens"
                  value={compactTokens(summary.total)}
                  sub={`输入 ${compactTokens(summary.input)} · 输出 ${compactTokens(summary.output)}`}
                />
                <DshStatTile
                  label="活跃天数 · Active days"
                  value={String(summary.activeDays)}
                  sub={summary.avgTtft ? `平均首字 ${summary.avgTtft} ms` : '按本地日期统计'}
                />
                <DshStatTile
                  label="高峰时段 · Peak hour"
                  value={summary.peakHour}
                  sub="最常发起对话的整点"
                />
                <DshStatTile
                  label="最常使用 · Favorite model"
                  value={summary.favoriteModel}
                  sub={summary.models[0] ? `占比 ${formatPercent(summary.models[0].share)}` : ''}
                  regularWeight
                />
              </div>

              {/* 2. Literary Yardstick line */}
              {summary.yardstick && (
                <div className="flex items-center gap-2 rounded-[10px] border border-[var(--cds-border)] bg-[var(--cds-surface-0)] px-3.5 py-2 text-[11.5px] text-[var(--cds-text-secondary)]">
                  <BookOpen size={13} className="shrink-0 text-clay" />
                  <span>{summary.yardstick}</span>
                  {summary.reasoning > 0 && (
                    <span className="ml-auto flex items-center gap-1 text-[10.5px] text-[var(--cds-text-muted)]">
                      <Sparkles size={11} className="text-clay" />
                      思考 Tokens: {compactTokens(summary.reasoning)}
                    </span>
                  )}
                </div>
              )}

              {/* 3. 16-Week x 7-Day Activity Heat Grid (`--dsh-claude-data-ink: #3b6ecf`) */}
              <section className="rounded-[12px] border border-[var(--cds-border)] bg-[var(--cds-surface-0)] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-[12px] font-semibold">每日活跃热力图（近 16 周）</div>
                  <div className="h-4 text-[11px] tabular-nums text-[var(--cds-text-secondary)]">
                    {hoverCell
                      ? `${hoverCell.label} · ${compactTokens(hoverCell.tokens)} tokens`
                      : '悬停方格查看单日 Token 消耗'}
                  </div>
                </div>
                <div className="grid grid-cols-16 gap-[4px]" style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}>
                  {summary.heatGrid.map((week, wIdx) => (
                    <div key={wIdx} className="flex flex-col gap-[4px]">
                      {week.map(cell => (
                        <div
                          key={cell.dateKey}
                          onMouseEnter={() => setHoverCell({ label: cell.label, tokens: cell.tokens })}
                          onMouseLeave={() => setHoverCell(null)}
                          className={cn(
                            'aspect-square w-full rounded-[3px] transition-transform duration-100 hover:scale-110',
                            cell.level === 0 && 'bg-black/[0.05] dark:bg-white/[0.06]',
                            cell.level === 1 && 'bg-[#3b6ecf]/25',
                            cell.level === 2 && 'bg-[#3b6ecf]/50',
                            cell.level === 3 && 'bg-[#3b6ecf]/75',
                            cell.level === 4 && 'bg-[#3b6ecf]',
                          )}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </section>

              {/* 4. Recent requests */}
              <section className="overflow-hidden rounded-[12px] border border-[var(--cds-border)] bg-[var(--cds-surface-0)]">
                <header className="flex items-center gap-2 border-b border-[var(--cds-border)] px-4 py-2.5">
                  <h2 className="text-[12px] font-semibold">最近结算请求</h2>
                  <span className="ml-auto text-[10px] text-[var(--cds-text-muted)]">点击可跳转至对应会话</span>
                </header>
                <div className="divide-y divide-[var(--cds-border)]">
                  {summary.recent.map(request => (
                    <button
                      key={request.id}
                      type="button"
                      onClick={() => openConversation(request.conversationId)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--cds-fill-ghost-hover)]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] font-medium">{request.conversationTitle || '新对话'}</div>
                        <div className="mt-0.5 truncate font-mono text-[10px] text-[var(--cds-text-muted)]">
                          {request.model} · {formatTime(request.createdAt)}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[11.5px] font-semibold tabular-nums">
                          {request.reported ? `${compactTokens(request.total)} tok` : '—'}
                          {request.reported && currency !== 'OFF' && (
                            <span className="ml-2 text-clay">
                              {formatCurrencyCost(request.costCny, request.costUsd, currency)}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] tabular-nums text-[var(--cds-text-muted)]">
                          {request.reported
                            ? `输入 ${compactTokens(request.input)} · 缓存 ${compactTokens(request.cached)} · 输出 ${compactTokens(request.output)}`
                            : '服务端未返回用量'}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          ) : (
            /* Models Tab (`dsh-claude-style` stacked daily bar chart + ranked swatch list) */
            <div className="space-y-5">
              <section className="rounded-[12px] border border-[var(--cds-border)] bg-[var(--cds-surface-0)] p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-[12px] font-semibold">按日 Token 趋势与输入/输出构成</h2>
                  <span className="text-[10.5px] tabular-nums text-[var(--cds-text-muted)]">
                    峰值：{compactTokens(maxDay)} tokens / 天
                  </span>
                </div>
                <div className="mt-4 flex h-[156px] items-end gap-2">
                  {summary.days.map(day => {
                    const height = day.total > 0 ? Math.max(5, (day.total / maxDay) * 100) : 0
                    const outputShare = day.total > 0 ? (day.output / day.total) * 100 : 0
                    return (
                      <div
                        key={day.key}
                        className="group relative flex h-full flex-1 flex-col items-center justify-end gap-1.5"
                        title={`${day.key} · ${compactTokens(day.total)} tokens (${formatCurrencyCost(day.costCny, day.costUsd, currency)})`}
                      >
                        <div
                          className="relative w-full max-w-[34px] overflow-hidden rounded-t-[4px] bg-[#3b6ecf]/15 transition-opacity group-hover:opacity-85"
                          style={{ height: `${height}%` }}
                        >
                          {day.total > 0 && (
                            <>
                              <div
                                className="absolute inset-x-0 bottom-0 bg-[#3b6ecf]"
                                style={{ height: `${outputShare}%` }}
                              />
                              <div
                                className="absolute inset-x-0 top-0 bg-[#3b6ecf]/40"
                                style={{ height: `${100 - outputShare}%` }}
                              />
                            </>
                          )}
                        </div>
                        <span className="text-[9.5px] tabular-nums text-[var(--cds-text-muted)]">{day.label}</span>
                      </div>
                    )
                  })}
                </div>
              </section>

              <section className="overflow-hidden rounded-[12px] border border-[var(--cds-border)] bg-[var(--cds-surface-0)]">
                <header className="flex items-center justify-between border-b border-[var(--cds-border)] px-4 py-3">
                  <h2 className="text-[12px] font-semibold">模型排行榜 · Ranked Models</h2>
                  <span className="text-[10.5px] text-[var(--cds-text-muted)]">
                    共 {summary.models.length} 个模型
                  </span>
                </header>
                <div className="divide-y divide-[var(--cds-border)]">
                  {(showAllModels ? summary.models : summary.models.slice(0, 6)).map((model, idx) => {
                    const swatch = MODEL_SWATCHES[Math.min(idx, MODEL_SWATCHES.length - 1)]
                    return (
                      <div key={model.model} className="flex items-center gap-3 px-4 py-3">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: swatch }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-mono text-[12px] font-semibold">
                              {model.model}
                            </span>
                            <span className="rounded bg-black/[0.05] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--cds-text-secondary)] dark:bg-white/[0.06]">
                              {formatPercent(model.share)}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-[10.5px] tabular-nums text-[var(--cds-text-muted)]">
                            <span>请求 {model.requests} 次</span>
                            <span>输入 {compactTokens(model.input)}</span>
                            <span>缓存 {compactTokens(model.cached)}</span>
                            <span>输出 {compactTokens(model.output)}</span>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-[12px] font-semibold tabular-nums">
                            {compactTokens(model.total)}
                          </div>
                          {currency !== 'OFF' && (
                            <div className="text-[10.5px] font-medium tabular-nums text-clay">
                              {formatCurrencyCost(model.costCny, model.costUsd, currency)}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {summary.models.length > 6 && (
                  <button
                    type="button"
                    onClick={() => setShowAllModels(v => !v)}
                    className="w-full border-t border-[var(--cds-border)] py-2 text-center text-[11px] font-medium text-clay hover:bg-[var(--cds-fill-ghost-hover)]"
                  >
                    {showAllModels ? '收起列表 (Show less)' : `展开全部 ${summary.models.length} 个模型 (Show more)`}
                  </button>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

function DshStatTile({
  label,
  value,
  sub,
  regularWeight = false,
}: {
  label: string
  value: string
  sub: string
  regularWeight?: boolean
}) {
  return (
    <div className="rounded-[11px] border border-[var(--cds-border)] bg-[var(--cds-surface-0)] px-3.5 py-3">
      <div className="text-[10.5px] text-[var(--cds-text-muted)]">{label}</div>
      <div
        className={cn(
          'mt-1 truncate text-[18px] tracking-[-0.02em] text-[var(--cds-text-primary)]',
          regularWeight ? 'font-mono text-[14.5px] font-medium' : 'font-semibold tabular-nums',
        )}
        title={value}
      >
        {value}
      </div>
      <div className="mt-1 truncate text-[10px] text-[var(--cds-text-muted)]">{sub}</div>
    </div>
  )
}
