import type { ChatMessage } from '@shared/types'

export type ExportTemplateId = 'paper' | 'ink' | 'minimal'

export interface ExportTemplate {
  id: ExportTemplateId
  name: string
  hint: string
  bg: string
  text: string
  muted: string
  accent: string
  border: string
  codeBg: string
  codeText: string
  quoteBg: string
  questionBg: string
  bodyFont: string
  headingFont: string
  bodySize: number
  leading: number
  monoFont: string
}

export const EXPORT_CARD_WIDTH = 1080

export const EXPORT_TEMPLATES: ExportTemplate[] = [
  {
    id: 'paper',
    name: '暖纸',
    hint: '衬线正文 · 适合长文阅读',
    bg: '#F5F0E6',
    text: '#24211C',
    muted: '#6E675C',
    accent: '#C96545',
    border: '#DED4C3',
    codeBg: '#EDE5D7',
    codeText: '#3A342B',
    quoteBg: '#F0E8DA',
    questionBg: '#EEE4D3',
    bodyFont: '"New York", "Songti SC", STSong, Georgia, serif',
    headingFont: '"New York", "Songti SC", STSong, Georgia, serif',
    bodySize: 19,
    leading: 1.9,
    monoFont: '"SF Mono", Menlo, ui-monospace, monospace',
  },
  {
    id: 'ink',
    name: '夜墨',
    hint: '深色纸张 · 低亮度阅读',
    bg: '#141413',
    text: '#F1EFE8',
    muted: '#A7A297',
    accent: '#E28769',
    border: '#35332D',
    codeBg: '#222220',
    codeText: '#E8E3D8',
    quoteBg: '#1F1F1C',
    questionBg: '#23231F',
    bodyFont: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", sans-serif',
    headingFont: '"New York", "Songti SC", STSong, Georgia, serif',
    bodySize: 18,
    leading: 1.85,
    monoFont: '"SF Mono", Menlo, ui-monospace, monospace',
  },
  {
    id: 'minimal',
    name: '素白',
    hint: '无衬线正文 · 干净利落',
    bg: '#FFFFFF',
    text: '#151515',
    muted: '#737373',
    accent: '#1F1F1F',
    border: '#E7E7E7',
    codeBg: '#F5F5F5',
    codeText: '#262626',
    quoteBg: '#FAFAFA',
    questionBg: '#F6F6F6',
    bodyFont: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", sans-serif',
    headingFont: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", sans-serif',
    bodySize: 18.5,
    leading: 1.82,
    monoFont: '"SF Mono", Menlo, ui-monospace, monospace',
  },
]

export function templateById(id: ExportTemplateId): ExportTemplate {
  return EXPORT_TEMPLATES.find(template => template.id === id) ?? EXPORT_TEMPLATES[0]
}

export interface ExportRound {
  id: string
  index: number
  user: ChatMessage | null
  assistants: ChatMessage[]
}

/** Group messages into user-led rounds; assistant messages stay with their question. */
export function buildExportRounds(messages: ChatMessage[]): ExportRound[] {
  const rounds: ExportRound[] = []
  let current: ExportRound | null = null
  for (const message of messages) {
    if (message.role === 'user') {
      current = { id: message.id, index: rounds.length + 1, user: message, assistants: [] }
      rounds.push(current)
    } else if (message.role === 'assistant') {
      if (!current) {
        current = { id: message.id, index: rounds.length + 1, user: null, assistants: [] }
        rounds.push(current)
      }
      current.assistants.push(message)
    }
  }
  return rounds.filter(round => {
    if (round.user && (round.user.content.trim() || round.user.attachments.length)) return true
    return round.assistants.some(message => message.content.trim() || message.attachments.length)
  })
}

export function roundIdForMessage(rounds: ExportRound[], messageId: string | null): string | null {
  if (!messageId) return null
  return rounds.find(round => round.user?.id === messageId || round.assistants.some(message => message.id === messageId))?.id ?? null
}

export function exportDateStamp(timestamp = Date.now()): string {
  const date = new Date(timestamp)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`
}

export function formatExportDay(timestamp = Date.now()): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

export function formatExportTime(timestamp: number): string {
  const date = new Date(timestamp)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export const MAX_EXPORT_CSS_HEIGHT = 30000

/** Keep the PNG under the Chromium canvas limit; long exports trade sharpness for size. */
export function exportPixelRatio(cssHeight: number): number {
  if (cssHeight <= 0) return 2
  return Math.min(2, Math.max(1, 30000 / cssHeight))
}

export function exportImageFilename(title: string, rounds: number): string {
  const safeTitle = String(title || '对话')
    .replace(/[\x00-\x1f\x7f/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 36) || '对话'
  return `Aster-${safeTitle}-${rounds}轮-${exportDateStamp()}.png`
}

export function stylesForTemplate(template: ExportTemplate): Record<string, string> {
  return {
    '--ex-bg': template.bg,
    '--ex-text': template.text,
    '--ex-muted': template.muted,
    '--ex-accent': template.accent,
    '--ex-border': template.border,
    '--ex-code-bg': template.codeBg,
    '--ex-code-text': template.codeText,
    '--ex-quote-bg': template.quoteBg,
    '--ex-question-bg': template.questionBg,
    '--ex-body-font': template.bodyFont,
    '--ex-heading-font': template.headingFont,
    '--ex-mono-font': template.monoFont,
    '--ex-body-size': `${template.bodySize}px`,
    '--ex-leading': String(template.leading),
  }
}
