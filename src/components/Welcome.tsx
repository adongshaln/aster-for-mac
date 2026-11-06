import { BarChart3, Clock, Settings2 } from 'lucide-react'
import { useMemo } from 'react'
import { AsterMark } from '@/components/AsterMark'
import { Composer } from '@/components/Composer'
import { useAppStore } from '@/state/store'
import { compactTokens, formatCurrencyCost, isDeepSeekPeakNow, summarizeUsage } from '@/lib/usage'
import { greeting } from '@/lib/utils'

export function Welcome() {
  const settings = useAppStore(state => state.config?.settings)
  const profiles = useAppStore(state => state.config?.profiles ?? [])
  const conversations = useAppStore(state => state.conversations)
  const openSettings = useAppStore(state => state.openSettings)
  const openUsage = useAppStore(state => state.openUsage)

  const summary = useMemo(() => summarizeUsage(conversations, '30d'), [conversations])
  const peakState = useMemo(() => isDeepSeekPeakNow(), [])
  const currency = settings?.billingCurrency ?? 'CNY'

  return (
    <div className="app-fade-in paper-grain relative flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[820px] flex-1 flex-col justify-center px-8 pb-16 pt-10">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="relative mb-5 flex size-[72px] items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-clay/[0.07] blur-2xl" />
            <AsterMark size={58} glow />
          </div>
          <h1 className="font-serif text-[32px] font-normal leading-[1.2] tracking-[-0.035em] text-[var(--cds-text-primary)]">
            {greeting(settings?.userName ?? '')}
          </h1>
          <p className="mt-2.5 max-w-[460px] text-[13px] leading-relaxed text-[var(--cds-text-secondary)]">
            今天想聊些什么，或交给 Aster 一个任务？
          </p>
        </div>

        {profiles.length === 0 ? (
          <div className="mx-auto w-full max-w-[520px] rounded-2xl border border-[var(--cds-border)] bg-[var(--cds-surface-2)] p-7 text-center shadow-sm">
            <h2 className="text-[15px] font-semibold">先连接一个模型</h2>
            <p className="mx-auto mt-1.5 max-w-[340px] text-[12px] leading-relaxed text-[var(--cds-text-secondary)]">
              填入任意 OpenAI 兼容服务或 Anthropic Messages 服务的地址与密钥，就可以开始了。
            </p>
            <button
              type="button"
              onClick={() => openSettings('services')}
              className="mt-4 inline-flex h-9 items-center gap-2 rounded-full bg-clay px-4 text-[12.5px] font-semibold text-white shadow-[0_4px_16px_rgba(217,119,87,0.28)] transition-all hover:bg-clay-hover active:scale-[0.97]"
            >
              <Settings2 size={13} />
              配置模型服务
            </button>
          </div>
        ) : (
          <div className="w-full space-y-3">
            {summary.requests > 0 && (
              <button
                type="button"
                onClick={openUsage}
                className="flex w-full items-center gap-4 rounded-[14px] border border-[var(--cds-border)] bg-[var(--cds-surface-2)]/75 px-4 py-2.5 text-left transition-all hover:border-[var(--cds-border-strong)]"
              >
                <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--cds-text-primary)]">
                  <BarChart3 size={13.5} className="text-clay" />
                  <span>近 30 天工作台概览</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] tabular-nums text-[var(--cds-text-secondary)]">
                  <span>{summary.sessions} 个会话</span>
                  <span>·</span>
                  <span>{summary.requests} 次调用</span>
                  <span>·</span>
                  <span>{compactTokens(summary.total)} tokens</span>
                  {currency !== 'OFF' && (
                    <>
                      <span>·</span>
                      <span className="font-semibold text-clay">
                        {formatCurrencyCost(summary.totalCostCny, summary.totalCostUsd, currency)}
                      </span>
                    </>
                  )}
                </div>
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-black/[0.04] px-2 py-0.5 text-[10px] font-medium text-[var(--cds-text-muted)] dark:bg-white/[0.06]">
                  <Clock size={10} />
                  DS {peakState.label} · ⌘U
                </span>
              </button>
            )}
            <Composer />
          </div>
        )}
      </div>
    </div>
  )
}
