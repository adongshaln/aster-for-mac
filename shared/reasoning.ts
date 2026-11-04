export type ReasoningFamily =
  | 'gpt'
  | 'grok'
  | 'claude'
  | 'gemini'
  | 'glm'
  | 'kimi-effort'
  | 'kimi-toggle'
  | 'deepseek'
  | 'unsupported'

export interface ReasoningChoice {
  id: string
  label: string
  hint: string
}

export const DEFAULT_REASONING = 'default'

export const EFFORT_RANK: Record<string, number> = {
  [DEFAULT_REASONING]: 0,
  none: 0,
  off: 0,
  minimal: 1,
  light: 2,
  low: 3,
  medium: 4,
  high: 5,
  on: 5,
  xhigh: 6,
  max: 7,
  ultra: 8,
}

const GPT_CHOICES: ReasoningChoice[] = [
  { id: DEFAULT_REASONING, label: '模型默认', hint: '不传 effort，由服务端决定' },
  { id: 'minimal', label: '极简', hint: '几乎不思考，最快' },
  { id: 'low', label: '快速', hint: '少量思考' },
  { id: 'medium', label: '均衡', hint: '默认档位' },
  { id: 'high', label: '深入', hint: '更多思考' },
  { id: 'xhigh', label: '深度', hint: '接近极限' },
  { id: 'max', label: '极致', hint: '最大思考深度' },
]

const GROK_CHOICES: ReasoningChoice[] = [
  { id: DEFAULT_REASONING, label: '模型默认', hint: 'Grok 默认 high' },
  { id: 'low', label: '快速', hint: '省思考 Token' },
  { id: 'medium', label: '均衡', hint: '复杂分析与长上下文' },
  { id: 'high', label: '深入', hint: '多步逻辑与复杂计算' },
  { id: 'xhigh', label: '极致', hint: '最大推理深度' },
]

const CLAUDE_CHOICES: ReasoningChoice[] = [
  { id: DEFAULT_REASONING, label: '模型默认', hint: 'Opus 默认 high，其余 medium' },
  { id: 'low', label: '快速', hint: '短思考预算，响应更快' },
  { id: 'medium', label: '均衡', hint: '中等思考预算' },
  { id: 'high', label: '深入', hint: '长思考预算' },
]

const GEMINI_CHOICES: ReasoningChoice[] = [
  { id: DEFAULT_REASONING, label: '模型默认', hint: '按 Gemini 官方默认思考档位' },
  { id: 'minimal', label: '极简', hint: '最低思考预算，响应最快' },
  { id: 'low', label: '快速', hint: '轻量思考（1,024 tokens）' },
  { id: 'medium', label: '均衡', hint: '中等思考（8,192 tokens）' },
  { id: 'high', label: '深入', hint: '深度思考（24,576 tokens）' },
]

const GLM_CHOICES: ReasoningChoice[] = [
  { id: DEFAULT_REASONING, label: '模型默认', hint: 'GLM 默认 max' },
  { id: 'none', label: '关闭', hint: '跳过思考' },
  { id: 'low', label: '快速', hint: '低思考深度' },
  { id: 'medium', label: '均衡', hint: '中等深度' },
  { id: 'high', label: '深入', hint: '较高深度' },
  { id: 'xhigh', label: '深度', hint: '接近极限' },
  { id: 'max', label: '极致', hint: '默认档位' },
]

const KIMI_EFFORT_CHOICES: ReasoningChoice[] = [
  { id: DEFAULT_REASONING, label: '模型默认', hint: 'Kimi K3 默认 max' },
  { id: 'low', label: '快速', hint: '低推理投入' },
  { id: 'high', label: '深入', hint: '高推理投入' },
  { id: 'max', label: '极致', hint: '最大推理投入' },
]

const TOGGLE_CHOICES: ReasoningChoice[] = [
  { id: DEFAULT_REASONING, label: '模型默认', hint: '按服务端默认处理' },
  { id: 'off', label: '关闭', hint: '本次不思考' },
  { id: 'on', label: '开启', hint: '先思考再回答' },
]

const DEEPSEEK_CHOICES: ReasoningChoice[] = [
  { id: DEFAULT_REASONING, label: '模型默认', hint: 'DeepSeek 默认 high' },
  { id: 'none', label: '关闭', hint: '跳过思考' },
  { id: 'low', label: '快速', hint: '低思考深度' },
  { id: 'high', label: '深入', hint: '高思考深度' },
  { id: 'max', label: '极致', hint: '最大思考深度' },
]

export function reasoningFamily(model: string): ReasoningFamily {
  const value = model.trim().split('/').pop()?.toLowerCase() ?? ''
  if (!value) return 'unsupported'
  if (
    value.startsWith('gpt-') ||
    value.startsWith('gpt_') ||
    (value.length > 3 && value.startsWith('gpt') && /\d/.test(value[3]))
  ) return 'gpt'
  if (value.startsWith('grok')) return 'grok'
  if (value.startsWith('claude') || value.includes('claude-')) return 'claude'
  if (
    (value.startsWith('gemini-2.5') ||
      value.startsWith('gemini-3') ||
      value.startsWith('gemini-4') ||
      value.includes('thinking')) &&
    !value.includes('image')
  ) return 'gemini'
  if (value.startsWith('glm')) return 'glm'
  if (value.includes('kimi') && value.includes('k3')) return 'kimi-effort'
  if (value.includes('kimi')) return 'kimi-toggle'
  if (value.startsWith('deepseek') || value.includes('deepseek-')) return 'deepseek'
  return 'unsupported'
}

export function reasoningChoices(model: string): ReasoningChoice[] {
  switch (reasoningFamily(model)) {
    case 'gpt': return GPT_CHOICES
    case 'grok': return GROK_CHOICES
    case 'claude': return CLAUDE_CHOICES
    case 'gemini': return GEMINI_CHOICES
    case 'glm': return GLM_CHOICES
    case 'kimi-effort': return KIMI_EFFORT_CHOICES
    case 'kimi-toggle': return TOGGLE_CHOICES
    case 'deepseek': return DEEPSEEK_CHOICES
    default: return []
  }
}

export function supportsReasoning(model: string): boolean {
  return reasoningChoices(model).length > 0
}

export function reasoningLabel(model: string, effort: string): string {
  const choices = reasoningChoices(model)
  if (!choices.length) return ''
  return choices.find(choice => choice.id === effort)?.label ?? choices[0].label
}

export function normalizeEffort(model: string, effort: string): string {
  const choices = reasoningChoices(model)
  if (!choices.length) return DEFAULT_REASONING
  return choices.some(choice => choice.id === effort) ? effort : DEFAULT_REASONING
}

export function writeReasoning(
  body: Record<string, unknown>,
  model: string,
  effort: string,
  responsesApi: boolean,
  maxOutputTokens: number,
): void {
  const value = normalizeEffort(model, effort)
  if (value === DEFAULT_REASONING) return

  switch (reasoningFamily(model)) {
    case 'gpt':
      if (responsesApi) body.reasoning = { effort: value }
      else body.reasoning_effort = value
      break
    case 'grok':
      body.reasoning_effort = value
      break
    case 'claude': {
      const requested = value === 'low' ? 2048 : value === 'medium' ? 8192 : value === 'high' ? 24576 : null
      if (requested == null) break
      const ceiling = maxOutputTokens > 2048 ? maxOutputTokens - 1024 : 0
      const budget = Math.min(requested, ceiling)
      if (budget >= 1024) body.thinking = { type: 'enabled', budget_tokens: budget }
      else if (maxOutputTokens > 0) body.thinking = { type: 'disabled' }
      break
    }
    case 'gemini':
      body.reasoning_effort = value
      break
    case 'glm':
      body.thinking = { type: value === 'none' ? 'disabled' : 'enabled' }
      if (value !== 'none') body.reasoning_effort = value
      break
    case 'kimi-effort':
      body.reasoning_effort = value
      break
    case 'kimi-toggle':
      body.thinking = { type: value === 'off' ? 'disabled' : 'enabled' }
      break
    case 'deepseek':
      body.thinking = { type: value === 'none' ? 'disabled' : 'enabled' }
      if (value !== 'none') body.reasoning_effort = value
      break
    default:
      break
  }
}

/** GPT and Grok model IDs are routed through the Responses API, matching Aster. */
export function usesResponses(model: string): boolean {
  const value = model.trim().split('/').pop()?.toLowerCase() ?? ''
  return reasoningFamily(value) === 'gpt' || reasoningFamily(value) === 'grok'
}
