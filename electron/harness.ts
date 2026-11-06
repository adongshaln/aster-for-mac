import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { createTwoFilesPatch } from 'diff'
import type { ArtifactItem, AskUserQuestionItem, ChatCitation, ChatRequest, ChatTurn, MessageUsage, Profile, ToolActivity } from '../shared/types'
import type { ChatEmitter, InteractiveCallbacks } from './api'
import { appDataDir, attachmentData } from './store'
import { buildHarnessToolDefinitions, resolveWorkspaceDir } from './tools'
import { createProviderProxy } from './provider-proxy'
import { withAbort } from './async'
import { SdkProcess } from './sdk-process'

const SDK_VERSION = '0.2.2-rc.1'
type RecordValue = Record<string, unknown>
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
const textBlocks = (value: unknown): string => Array.isArray(value) ? value.map(block => record(block).type === 'text' ? String(record(block).text ?? '') : '').join('') : ''

function physicalPath(file: string): string {
  return file.replace(/app\.asar(?=\/|$)/, 'app.asar.unpacked')
}

function historyKey(turns: ChatTurn[]): string {
  const visible = turns.filter(turn => turn.content.trim() || turn.attachmentIds?.length)
    .map(turn => [turn.role, turn.content, turn.attachmentIds ?? []])
  return createHash('sha256').update(JSON.stringify(visible)).digest('hex')
}

interface Checkpoint { home: string; sessionId: string }

function checkpointIndex(file: string): Record<string, Checkpoint> {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, Checkpoint> } catch { return {} }
}

function saveIndex(file: string, value: Record<string, Checkpoint>): void {
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(value), { mode: 0o600 })
  fs.renameSync(`${file}.tmp`, file)
}

function runtimeEnvironment(token: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const key of ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL', 'SYSTEMROOT']) {
    if (process.env[key]) env[key] = process.env[key]
  }
  return { ...env, ASTER_PROXY_TOKEN: token, DSH_MAX_TOKENS_AS_SUCCESS: 'false' }
}

/** Run ordinary agent tasks through the version-pinned official SDK. */
export async function streamHarness(
  profile: Profile, apiKey: string, request: ChatRequest, emit: ChatEmitter,
  signal: AbortSignal, callbacks: InteractiveCallbacks = {},
): Promise<void> {
  signal.throwIfAborted()
  if (!request.conversationId || !/^[\w-]+$/.test(request.conversationId)) throw new Error('会话标识无效')
  const workspace = resolveWorkspaceDir(request.workspaceDir)
  const root = path.join(appDataDir(), 'runtime', request.conversationId)
  fs.mkdirSync(root, { recursive: true })
  const indexFile = path.join(root, 'checkpoints.json')
  const index = checkpointIndex(indexFile)
  const previousTurns = request.messages.slice(0, -1)
  const previous = index[historyKey(previousTurns)]
  const runId = randomUUID()
  const home = path.join(root, runId)
  const sessionId = previous?.sessionId ?? `aster-${randomUUID()}`
  if (previous) {
    const source = path.join(root, previous.home)
    if (!fs.existsSync(source)) throw new Error('任务历史缺失，请从此对话的完整记录恢复后重试')
    fs.cpSync(source, home, { recursive: true, mode: fs.constants.COPYFILE_FICLONE })
  } else fs.mkdirSync(home, { recursive: true })

  const launchDir = path.join(root, `${runId}-launch`)
  fs.mkdirSync(launchDir)
  const skillRoot = path.join(root, 'skills')
  fs.rmSync(skillRoot, { recursive: true, force: true })
  fs.mkdirSync(skillRoot)
  for (const [i, skill] of (request.activeSkills ?? []).filter(skill => skill.enabled).entries()) {
    const destination = path.join(skillRoot, `skill-${skill.id.replace(/[^\w-]/g, '') || i}`)
    if (skill.localPath && fs.existsSync(skill.localPath)) fs.symlinkSync(skill.localPath, destination)
    else {
      fs.mkdirSync(destination)
      const content = skill.content.startsWith('---') ? skill.content : `---\nname: ${JSON.stringify(skill.name)}\ndescription: ${JSON.stringify(skill.description)}\n---\n\n${skill.content}`
      fs.writeFileSync(path.join(destination, 'SKILL.md'), content)
    }
  }
  const appRoot = physicalPath(path.resolve(__dirname, '../..'))
  const proxy = await createProviderProxy(profile, apiKey, request, signal)
  const patchFile = path.join(launchDir, 'aster.patch.json')
  const permissionMode = request.permissionMode ?? 'auto'
  const limit = Math.max(4096, request.contextLimit || 128000)
  const patch = [
    { id: 'llm-pi-ai', config: { providers: { 'aster-provider': {
      api: proxy.protocol, baseURL: proxy.baseURL, apiKeyEnv: 'ASTER_PROXY_TOKEN',
      models: [{ id: request.model, contextWindow: limit, maxTokens: Math.min(8192, Math.floor(limit / 3)), input: ['text', 'image'], reasoningEfforts: false }],
      ...(proxy.protocol === 'openai-completions' ? { compat: { supportsDeveloperRole: false, thinkingFormat: 'deepseek' } } : {}),
      retryPolicy: { mode: 'normal', maxRetries: 3 },
    } } } },
    { id: 'llm-deepseek', disabled: true }, { id: 'llm-deepseek-account', disabled: true },
    { id: 'system-prompt', config: { personaPrefix: request.systemPrompt || '你是 Aster，完成用户委派的任务并验证结果。请使用清晰、自然的中文回答。' } },
    { id: 'sandbox-policy', config: { mode: permissionMode === 'auto' ? 'danger-full-access' : permissionMode === 'plan-only' ? 'read-only' : 'workspace-write', workspaceRoot: workspace } },
    { id: 'approval', config: { policy: permissionMode === 'auto' ? 'never' : 'ask' } },
    { id: 'compaction-basic', config: { headroomTokens: Math.min(4096, Math.floor(limit / 8)), maxTokens: Math.min(4096, Math.floor(limit / 4)), retainRatio: 0.16 } },
    { id: 'skill-filesystem', config: { includeDefaultRoots: false, customSkillDirs: [skillRoot, path.join(workspace, '.agents', 'skills')] } },
    { id: 'tool-web', disabled: true }, { id: 'tool-schedule', disabled: true },
    { insert: [{ id: 'aster-bridge', name: pathToFileURL(path.join(appRoot, 'runtime/aster-plugin.mjs')).href, config: {
      permissionMode, workspaceDir: workspace, webSearchEnabled: request.webSearchEnabled ?? true,
      profile: { ...profile, baseUrl: 'https://aster.invalid', extraHeaders: '', apiKey: undefined, clearApiKey: undefined },
      webToolsModule: pathToFileURL(path.join(appRoot, 'dist-electron/electron/tools.js')).href,
      webDefinitions: buildHarnessToolDefinitions({ webSearchEnabled: true, harnessToolsEnabled: false, permissionMode: 'plan-only', skills: [] }),
    } }] },
  ]
  try { fs.writeFileSync(patchFile, JSON.stringify(patch), { mode: 0o600 }) } catch (error) {
    await proxy.close()
    fs.rmSync(launchDir, { recursive: true, force: true })
    throw error
  }

  const started = Date.now()
  let firstToken: number | null = null
  let output = ''
  let lastRootAttempt = ''
  let admitted = false
  const streamedAttempts = new Set<string>()
  const activities = new Map<string, ToolActivity>()
  const usageSeen = new Set<string>()
  const usage: MessageUsage = { inputTokens: 0, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 }
  const addUsage = (value: unknown, identity: string) => {
    if (usageSeen.has(identity)) return
    usageSeen.add(identity)
    const data = record(value)
    const read = Number(data.cacheReadTokens) || 0
    const write = Number(data.cacheWriteTokens) || 0
    const input = (Number(data.inputTokens) || 0) + read + write
    const out = Number(data.outputTokens) || 0
    usage.inputTokens += input; usage.cachedTokens += read; usage.cacheWriteTokens += write
    usage.outputTokens += out; usage.reasoningTokens += Number(data.reasoningTokens) || 0
    usage.totalTokens += Number(data.totalTokens) || input + out
    emit({ type: 'usage', usage: { ...usage } })
  }
  const notify = (notification: { method: string; params: RecordValue }) => {
    const { method, params } = notification
    const rootSession = params.sessionId === sessionId
    if (method === 'aster.stream') {
      const frame = record(params.frame)
      const chunk = record(frame.chunk)
      const attempt = String(frame.attemptId)
      if (rootSession && frame.type === 'chunk') {
        if (chunk.type === 'text-delta') {
          if (lastRootAttempt && lastRootAttempt !== attempt && output) { output += '\n\n'; emit({ type: 'delta', text: '\n\n' }) }
          lastRootAttempt = attempt
          streamedAttempts.add(`${frame.turn}:${frame.step}`)
          const text = String(chunk.text ?? '')
          output += text; firstToken ??= Date.now()
          emit({ type: 'delta', text })
        } else if (chunk.type === 'reasoning-delta') {
          firstToken ??= Date.now(); emit({ type: 'reasoning', text: String(chunk.text ?? '') })
        }
      }
    } else if (method === 'aster.artifact') emit({ type: 'artifact', artifact: params.artifact as ArtifactItem })
    else if (method === 'aster.citations') emit({ type: 'citations', citations: params.citations as ChatCitation[] })
    else if (method === 'subagent.started') emit({ type: 'status', message: '子智能体正在处理任务' })
    else if (method === 'session.event') {
      const event = record(params.event)
      const data = record(event.data)
      if (['assistant/message', 'assistant/attempt', 'compaction/summary'].includes(String(event.type)) && data.usage) addUsage(data.usage, `${params.sessionId}:${event.seq}`)
      if (rootSession && event.type === 'user/message') admitted = true
      if (event.type === 'assistant/message') {
        if (rootSession && !streamedAttempts.has(`${data.turn}:${data.step}`)) {
          const text = textBlocks(record(data.message).content)
          if (text) { const next = output ? `\n\n${text}` : text; output += next; firstToken ??= Date.now(); emit({ type: 'delta', text: next }) }
        }
      } else if (event.type === 'tool/call') {
        const id = `${params.sessionId}:${data.callId}`
        let input: RecordValue = {}
        try { input = JSON.parse(String(data.arguments)) as RecordValue } catch { /* Raw malformed arguments stay in dsh's durable event. */ }
        const activity: ToolActivity = { id, name: String(data.name), label: String(input.description ?? input.file_path ?? input.path ?? data.name), status: 'running', input }
        activities.set(id, activity); emit({ type: 'tool', activity })
      } else if (event.type === 'tool/result') {
        const message = record(data.message)
        const id = `${params.sessionId}:${message.toolCallId}`
        const activity = activities.get(id)
        if (activity) {
          const meta = record(data.meta)
          const diffs = Array.isArray(meta.diffs) ? meta.diffs.map(record) : []
          const first = diffs[0]
          const updated: ToolActivity = { ...activity, status: message.isError ? 'failed' : 'completed', output: textBlocks(message.content).slice(0, 4000), ...(first ? { diff: { filename: String(first.path), oldText: String(first.oldText ?? ''), newText: String(first.newText ?? '') } } : {}) }
          activities.set(id, updated); emit({ type: 'tool', activity: updated })
          if (!message.isError) {
            for (const [i, diff] of diffs.entries()) {
              const filename = String(diff.path)
              emit({ type: 'artifact', artifact: { id: `diff-${id}-${i}`, title: path.basename(filename), kind: 'diff', filename, oldText: String(diff.oldText ?? ''), newText: String(diff.newText ?? ''), content: createTwoFilesPatch(filename, filename, String(diff.oldText ?? ''), String(diff.newText ?? '')) } })
            }
            if (activity.name === 'write' && !diffs.length && typeof activity.input?.content === 'string') {
              const filename = String(activity.input.file_path)
              const extension = path.extname(filename).slice(1)
              emit({ type: 'artifact', artifact: { id: `file-${id}`, title: path.basename(filename), filename, kind: extension === 'html' || extension === 'svg' ? extension : extension === 'md' ? 'markdown' : extension === 'mmd' ? 'mermaid' : 'code', content: activity.input.content, language: extension } })
            }
          }
        }
      } else if (rootSession && event.type === 'todo/write') emit({ type: 'todos', todos: data.todos as import('../shared/types').TodoItem[] })
      else if (event.type === 'llm/retry') emit({ type: 'status', message: '连接暂时中断，正在重试' })
      else if (event.type === 'compaction/start') emit({ type: 'status', message: '正在整理任务上下文' })
    }
  }

  let harness: SdkProcess | undefined
  let initialized = false
  let failure: unknown
  let finishReason: string | null = null
  const abort = () => { void harness?.close().catch(() => {}) }
  try {
    harness = new SdkProcess(runtimeEnvironment(proxy.token))
    harness.onNotification = notify
    harness.onInteraction = async (kind, payload) => {
      if (kind === 'question') {
        const question = payload as import('@deepseek-ai/dsh-sdk-client').SdkUserQuestionRequest
        const questions: AskUserQuestionItem[] = question.questions.map(q => ({ id: q.id, question: q.detail ? `${q.question}\n\n${q.detail}` : q.question, header: q.header, options: q.options?.map((option: { label: string; description?: string }) => ({ label: option.label, description: option.description })) }))
        const callId = `${question.sessionId}:${question.requestId}`
        emit({ type: 'ask_user', callId, questions })
        if (!callbacks.requestAskUser) return { cancelled: true }
        const answers = await withAbort(callbacks.requestAskUser(callId, questions), signal)
        return { answers: question.questions.map(q => {
          const answer = answers[q.id] ?? ''
          return q.options?.some((option: { label: string }) => option.label === answer) ? { id: q.id, selected: [answer] } : { id: q.id, selected: [], custom: answer }
        }) }
      }
      const { method, params } = payload as { method: string; params: unknown }
      if (method !== 'approval/request') throw new Error('未知运行时交互')
      const data = record(params)
      const callId = `${data.sessionId}:${data.callId ?? randomUUID()}`
      const activity = activities.get(callId) ?? { id: callId, name: String(data.toolName), label: String(data.reason ?? data.toolName), status: 'pending_approval' as const }
      emit({ type: 'tool_approval', callId, activity })
      const decision = callbacks.requestApproval ? await withAbort(callbacks.requestApproval(callId, activity), signal) : 'deny'
      return { outcome: decision === 'deny' ? 'rejected' : 'allowed-once' }
    }
    signal.addEventListener('abort', abort, { once: true })
    signal.throwIfAborted()
    emit({ type: 'status', message: previous ? '正在恢复任务上下文' : '正在准备任务' })
    await harness.request('initialize', {
      profile: 'sdk', dshHome: home, cwd: workspace, processCwd: workspace, provider: 'aster-provider', model: request.model,
      patches: [patchFile], env: runtimeEnvironment(proxy.token), approvalRequests: true, initializeTimeoutMs: 30000,
    })
    initialized = true
    if (previous) await harness.request('resume', { sessionId })
    await harness.request('workspace', { sessionId, path: workspace })
    const last = request.messages.at(-1)
    if (!last) throw new Error('消息内容为空')
    const prefix = !previous && previousTurns.length ? `以下是从原对话导入的历史记录，请保留其中的用户需求与结论：\n${JSON.stringify(previousTurns.map(turn => ({ role: turn.role, content: turn.content })))}\n\n当前请求：\n` : ''
    const content: import('@deepseek-ai/dsh-sdk-client').SdkPromptContentBlock[] = [{ type: 'text', text: prefix + last.content }]
    for (const id of last.attachmentIds ?? []) {
      const mimeType = /\.png$/i.test(id) ? 'image/png' as const : /\.webp$/i.test(id) ? 'image/webp' as const : /\.gif$/i.test(id) ? 'image/gif' as const : 'image/jpeg' as const
      const image = attachmentData(id, mimeType)
      content.push({ type: 'image', mimeType, data: image.base64 })
    }
    const result = await harness.request<import('@deepseek-ai/dsh-sdk-client').RunResult>('run', { sessionId, content })
    finishReason = result.finishReason
    if (finishReason === 'error' || finishReason === 'blocked') {
      const terminal = [...result.events].reverse().find(event => event.type === 'turn/end')
      const reason = record(record(record(terminal).data).reason)
      throw new Error(String(record(reason.error).message ?? '任务未能完成，请查看执行记录'))
    }
  } catch (error) {
    failure = error
  } finally {
    signal.removeEventListener('abort', abort)
    await harness?.close().catch(error => { failure ??= error })
    await proxy.close()
    if (initialized && admitted) {
      index[historyKey([...request.messages, { role: 'assistant', content: output }])] = { home: runId, sessionId }
      saveIndex(indexFile, index)
    }
    fs.rmSync(launchDir, { recursive: true, force: true })
  }
  usage.durationMs = Date.now() - started
  usage.timeToFirstTokenMs = firstToken === null ? null : firstToken - started
  emit({ type: 'usage', usage })
  if (signal.aborted) { emit({ type: 'stopped' }); return }
  if (failure) throw failure
  if (finishReason !== 'completed') { emit({ type: 'status', message: '任务已中断，可继续执行' }); emit({ type: 'stopped' }); return }
  emit({ type: 'done', usage, durationMs: usage.durationMs })
}

export { SDK_VERSION }
