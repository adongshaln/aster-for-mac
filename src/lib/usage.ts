import type { BillingCurrency, Conversation, MessageUsage } from '@shared/types'

export interface UsageDay {
  key: string
  label: string
  requests: number
  input: number
  output: number
  total: number
  costCny: number
  costUsd: number
}

export interface UsageModel {
  model: string
  requests: number
  input: number
  output: number
  cached: number
  total: number
  costCny: number
  costUsd: number
  share: number
}

export interface UsageRequest {
  id: string
  conversationId: string
  conversationTitle: string
  model: string
  createdAt: number
  input: number
  output: number
  cached: number
  total: number
  ttft: number | null
  reported: boolean
  costCny: number
  costUsd: number
}

export interface HeatCell {
  dateKey: string
  label: string
  tokens: number
  level: 0 | 1 | 2 | 3 | 4
}

export interface UsageSummary {
  sessions: number
  requests: number
  reportedRequests: number
  activeDays: number
  peakHour: string
  favoriteModel: string
  input: number
  output: number
  cached: number
  reasoning: number
  total: number
  totalCostCny: number
  totalCostUsd: number
  cacheRate: number
  avgTtft: number | null
  ttftSamples: number
  yardstick: string | null
  days: UsageDay[]
  heatGrid: HeatCell[][] // 16 weeks x 7 days
  models: UsageModel[]
  recent: UsageRequest[]
  firstAt: number | null
  lastAt: number | null
}

export type UsageRange = 'all' | '30d' | '7d'

interface ModelRate {
  input: number
  cached: number
  output: number
}

// Per-million token rates (CNY & USD) matching dsh-claude-style / official vendor pricing
const CNY_RATES: Record<string, ModelRate> = {
  'deepseek-flash': { input: 1.0, cached: 0.02, output: 4.0 },
  'deepseek-v4-pro': { input: 4.5, cached: 0.15, output: 13.5 },
  'gemini-4-argon': { input: 14.0, cached: 0.7, output: 70.0 },
  'gemini-2.5-pro': { input: 9.0, cached: 1.8, output: 72.0 },
  'gemini-2.5-flash': { input: 1.1, cached: 0.25, output: 4.3 },
  'claude-opus': { input: 36.0, cached: 3.6, output: 180.0 },
  'claude-sonnet': { input: 21.6, cached: 2.16, output: 108.0 },
  'claude-haiku': { input: 5.8, cached: 0.58, output: 29.0 },
  'gpt-5': { input: 14.0, cached: 3.5, output: 56.0 },
  'gpt-4': { input: 14.0, cached: 3.5, output: 56.0 },
  'grok-4': { input: 21.0, cached: 5.2, output: 105.0 },
  'kimi-k3': { input: 4.0, cached: 1.0, output: 16.0 },
  'glm-5': { input: 4.0, cached: 1.0, output: 16.0 },
}

const USD_RATES: Record<string, ModelRate> = {
  'deepseek-flash': { input: 0.15, cached: 0.003, output: 0.6 },
  'deepseek-v4-pro': { input: 0.66, cached: 0.022, output: 1.98 },
  'gemini-4-argon': { input: 2.0, cached: 0.1, output: 10.0 },
  'gemini-2.5-pro': { input: 1.25, cached: 0.25, output: 10.0 },
  'gemini-2.5-flash': { input: 0.15, cached: 0.0375, output: 0.6 },
  'claude-opus': { input: 5.0, cached: 0.5, output: 25.0 },
  'claude-sonnet': { input: 3.0, cached: 0.3, output: 15.0 },
  'claude-haiku': { input: 0.8, cached: 0.08, output: 4.0 },
  'gpt-5': { input: 2.0, cached: 0.5, output: 8.0 },
  'gpt-4': { input: 2.0, cached: 0.5, output: 8.0 },
  'grok-4': { input: 3.0, cached: 0.75, output: 15.0 },
  'kimi-k3': { input: 0.6, cached: 0.15, output: 2.4 },
  'glm-5': { input: 0.6, cached: 0.15, output: 2.4 },
}

/**
 * Literary yardsticks ported from `dsh-claude-style` (`packages/client/src/features/home/home-figures.ts`).
 */
const BOOKS = [
  { title: '《小王子》', tokens: 22_000 },
  { title: '《老人与海》', tokens: 36_000 },
  { title: '《了不起的盖茨比》', tokens: 64_000 },
  { title: '《白鲸记 (Moby-Dick)》', tokens: 280_000 },
  { title: '《三体》全三册', tokens: 1_150_000 },
  { title: '《战争与和平》', tokens: 780_000 },
]

export function isDeepSeekPeakNow(ms = Date.now()): { isPeak: boolean; label: string; detail: string } {
  const d = new Date(ms)
  const utcDay = d.getUTCDay()
  const utcHour = d.getUTCHours()
  const utcMin = d.getUTCMinutes()
  const mins = utcHour * 60 + utcMin
  const isWeekday = utcDay >= 1 && utcDay <= 5
  const inWindow1 = mins >= 60 && mins < 240 // 01:00 - 04:00 UTC (09:00 - 12:00 CST)
  const inWindow2 = mins >= 360 && mins < 600 // 06:00 - 10:00 UTC (14:00 - 18:00 CST)
  const isPeak = isWeekday && (inWindow1 || inWindow2)
  return {
    isPeak,
    label: isPeak ? '峰时 2×' : '谷时 1×',
    detail: isPeak
      ? 'DeepSeek API 当前处于峰时计费窗口（北京时间 09:00–12:00 / 14:00–18:00 工作日）'
      : 'DeepSeek API 当前处于谷时 1× 基准低价时段',
  }
}

function resolveRateKey(modelId: string): string {
  const lower = modelId.toLowerCase()
  if (lower.includes('deepseek') && lower.includes('pro')) return 'deepseek-v4-pro'
  if (lower.includes('deepseek')) return 'deepseek-flash'
  if (lower.includes('argon') || lower.includes('gemini-4')) return 'gemini-4-argon'
  if (lower.includes('gemini') && lower.includes('pro')) return 'gemini-2.5-pro'
  if (lower.includes('gemini')) return 'gemini-2.5-flash'
  if (lower.includes('opus')) return 'claude-opus'
  if (lower.includes('haiku')) return 'claude-haiku'
  if (lower.includes('claude') || lower.includes('sonnet')) return 'claude-sonnet'
  if (lower.includes('grok')) return 'grok-4'
  if (lower.includes('kimi') || lower.includes('k3')) return 'kimi-k3'
  if (lower.includes('glm')) return 'glm-5'
  if (lower.includes('gpt-5')) return 'gpt-5'
  return 'gpt-4'
}

export function estimateMessageCost(
  modelId: string,
  inputTokens: number,
  cachedTokens: number,
  outputTokens: number,
  timestampMs = Date.now(),
): { cny: number; usd: number } {
  const key = resolveRateKey(modelId)
  const cnyRate = CNY_RATES[key] ?? CNY_RATES['gpt-4']
  const usdRate = USD_RATES[key] ?? USD_RATES['gpt-4']
  const multiplier = key.startsWith('deepseek') && isDeepSeekPeakNow(timestampMs).isPeak ? 2 : 1
  const uncachedInput = Math.max(0, inputTokens - cachedTokens)
  const cny =
    ((uncachedInput * cnyRate.input + cachedTokens * cnyRate.cached + outputTokens * cnyRate.output) / 1_000_000) *
    multiplier
  const usd =
    ((uncachedInput * usdRate.input + cachedTokens * usdRate.cached + outputTokens * usdRate.output) / 1_000_000) *
    multiplier
  return { cny, usd }
}

export function formatCurrencyCost(cny: number, usd: number, currency: BillingCurrency = 'CNY'): string {
  if (currency === 'OFF') return ''
  const val = currency === 'USD' ? usd : cny
  const sym = currency === 'USD' ? '$' : '¥'
  if (val <= 0) return `${sym}0.00`
  if (val < 0.01) return `${sym}${val.toFixed(4)}`
  if (val < 1) return `${sym}${val.toFixed(3)}`
  return `${sym}${val.toFixed(2)}`
}

function dayKey(ms: number): string {
  const date = new Date(ms)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function usageTotal(usage: MessageUsage): number {
  if (Number.isFinite(usage.totalTokens) && usage.totalTokens > 0) return usage.totalTokens
  return Math.max(0, usage.inputTokens) + Math.max(0, usage.outputTokens)
}

function computeYardstick(totalTokens: number): string | null {
  const passed = [...BOOKS].filter(b => totalTokens >= b.tokens).sort((a, b) => b.tokens - a.tokens)
  if (!passed.length) return null
  const book = passed[0]
  const multiple = Math.max(1, Math.round((totalTokens / book.tokens) * 10) / 10)
  return `累计消耗约等于 ${multiple}× 部${book.title}的篇幅`
}

export function summarizeUsage(conversations: Conversation[], range: UsageRange = 'all'): UsageSummary {
  const now = Date.now()
  const cutoffMs =
    range === '7d'
      ? now - 7 * 86_400_000
      : range === '30d'
        ? now - 30 * 86_400_000
        : 0

  const summary: UsageSummary = {
    sessions: 0,
    requests: 0,
    reportedRequests: 0,
    activeDays: 0,
    peakHour: '—',
    favoriteModel: '—',
    input: 0,
    output: 0,
    cached: 0,
    reasoning: 0,
    total: 0,
    totalCostCny: 0,
    totalCostUsd: 0,
    cacheRate: 0,
    avgTtft: null,
    ttftSamples: 0,
    yardstick: null,
    days: [],
    heatGrid: [],
    models: [],
    recent: [],
    firstAt: null,
    lastAt: null,
  }

  const chartDaysCount = range === '7d' ? 7 : 14
  const dayMap = new Map<string, UsageDay>()
  for (let offset = chartDaysCount - 1; offset >= 0; offset -= 1) {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - offset)
    const key = dayKey(date.getTime())
    dayMap.set(key, {
      key,
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      requests: 0,
      input: 0,
      output: 0,
      total: 0,
      costCny: 0,
      costUsd: 0,
    })
  }

  const allDailyTokens = new Map<string, number>()
  const hourCounts = new Array<number>(24).fill(0)
  const modelMap = new Map<string, UsageModel>()
  const recent: UsageRequest[] = []
  const sessionIds = new Set<string>()
  let ttftSum = 0
  let ttftCount = 0

  for (const conversation of conversations) {
    for (const message of conversation.messages) {
      if (message.role !== 'assistant') continue
      const createdAt = message.createdAt || conversation.updatedAt
      const dKey = dayKey(createdAt)
      const usage = message.usage
      const reported = Boolean(usage)
      const input = usage ? Math.max(0, usage.inputTokens) : 0
      const output = usage ? Math.max(0, usage.outputTokens) : 0
      const cached = usage ? Math.min(input, Math.max(0, usage.cachedTokens)) : 0
      const total = usage ? usageTotal(usage) : 0
      const model = message.model || conversation.model || '未知模型'

      if (reported && total > 0) {
        allDailyTokens.set(dKey, (allDailyTokens.get(dKey) ?? 0) + total)
      }

      if (cutoffMs > 0 && createdAt < cutoffMs) continue

      sessionIds.add(conversation.id)
      summary.requests += 1
      if (reported) summary.reportedRequests += 1
      summary.firstAt = summary.firstAt == null ? createdAt : Math.min(summary.firstAt, createdAt)
      summary.lastAt = summary.lastAt == null ? createdAt : Math.max(summary.lastAt, createdAt)

      const hr = new Date(createdAt).getHours()
      hourCounts[hr] += 1

      const cost = reported ? estimateMessageCost(model, input, cached, output, createdAt) : { cny: 0, usd: 0 }

      const day = dayMap.get(dKey)
      if (day) {
        day.requests += 1
        if (reported) {
          day.input += input
          day.output += output
          day.total += total
          day.costCny += cost.cny
          day.costUsd += cost.usd
        }
      }

      const modelEntry = modelMap.get(model) ?? {
        model,
        requests: 0,
        input: 0,
        output: 0,
        cached: 0,
        total: 0,
        costCny: 0,
        costUsd: 0,
        share: 0,
      }
      modelEntry.requests += 1
      if (reported) {
        summary.input += input
        summary.output += output
        summary.cached += cached
        summary.reasoning += Math.max(0, usage!.reasoningTokens)
        summary.total += total
        summary.totalCostCny += cost.cny
        summary.totalCostUsd += cost.usd
        modelEntry.input += input
        modelEntry.output += output
        modelEntry.cached += cached
        modelEntry.total += total
        modelEntry.costCny += cost.cny
        modelEntry.costUsd += cost.usd
      }
      modelMap.set(model, modelEntry)

      const ttft = usage?.timeToFirstTokenMs
      if (typeof ttft === 'number' && ttft > 0) {
        ttftSum += ttft
        ttftCount += 1
      }

      recent.push({
        id: message.id,
        conversationId: conversation.id,
        conversationTitle: conversation.title,
        model,
        createdAt,
        input,
        output,
        cached,
        total,
        ttft: typeof ttft === 'number' && ttft > 0 ? ttft : null,
        reported,
        costCny: cost.cny,
        costUsd: cost.usd,
      })
    }
  }

  summary.sessions = sessionIds.size
  summary.activeDays = [...allDailyTokens.entries()].filter(([k, v]) => {
    if (v <= 0) return false
    if (cutoffMs <= 0) return true
    return new Date(k).getTime() >= cutoffMs - 86_400_000
  }).length

  let maxHr = -1
  let maxHrVal = 0
  hourCounts.forEach((cnt, hr) => {
    if (cnt > maxHrVal) {
      maxHrVal = cnt
      maxHr = hr
    }
  })
  summary.peakHour = maxHr >= 0 ? `${String(maxHr).padStart(2, '0')}:00` : '—'

  summary.cacheRate = summary.input > 0 ? summary.cached / summary.input : 0
  summary.avgTtft = ttftCount > 0 ? Math.round(ttftSum / ttftCount) : null
  summary.ttftSamples = ttftCount
  summary.days = [...dayMap.values()]
  const sortedModels = [...modelMap.values()].sort((left, right) => right.total - left.total)
  sortedModels.forEach(m => {
    m.share = summary.total > 0 ? m.total / summary.total : 0
  })
  summary.models = sortedModels
  summary.favoriteModel = sortedModels[0]?.model.split('/').pop() ?? '—'
  summary.yardstick = computeYardstick(summary.total)
  summary.recent = recent.sort((left, right) => right.createdAt - left.createdAt).slice(0, 12)

  // Build 16-week x 7-day heat grid (matching dsh-claude-style's usage heat grid)
  const weeks = 16
  const maxDaily = Math.max(1, ...allDailyTokens.values())
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const grid: HeatCell[][] = []
  for (let w = weeks - 1; w >= 0; w--) {
    const col: HeatCell[] = []
    for (let d = 6; d >= 0; d--) {
      const offsetDays = w * 7 + d
      const cellDate = new Date(today)
      cellDate.setDate(today.getDate() - offsetDays)
      const key = dayKey(cellDate.getTime())
      const tokens = allDailyTokens.get(key) ?? 0
      const ratio = tokens / maxDaily
      const level: 0 | 1 | 2 | 3 | 4 =
        tokens <= 0 ? 0 : ratio < 0.15 ? 1 : ratio < 0.4 ? 2 : ratio < 0.72 ? 3 : 4
      col.unshift({
        dateKey: key,
        label: `${cellDate.getMonth() + 1}月${cellDate.getDate()}日`,
        tokens,
        level,
      })
    }
    grid.push(col)
  }
  summary.heatGrid = grid

  return summary
}

export function compactTokens(value: number): string {
  if (!Number.isFinite(value)) return '0'
  if (value >= 1_000_000) {
    const scaled = value / 1_000_000
    return `${scaled >= 10 ? scaled.toFixed(0) : scaled.toFixed(1).replace(/\.0$/, '')}M`
  }
  if (value >= 1_000) {
    const scaled = value / 1_000
    return `${scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1).replace(/\.0$/, '')}k`
  }
  return String(Math.round(value))
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0%'
  return `${Math.round(value * 100)}%`
}
