import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'aster-runtime-bridge'
export const inject = ['tools', 'agents']
const notify = (method, params) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')

/** UI transport and deployment policy; task execution remains owned by dsh. */
export function apply(ctx, config) {
  const attempts = new Map()
  ctx.on('agent/assistant-stream', ({ agent, frame }) => {
    if (frame.type === 'start') attempts.set(frame.attemptId, { turn: frame.turn, step: frame.step })
    notify('aster.stream', { sessionId: agent.session.id, frame: { ...attempts.get(frame.attemptId), ...frame } })
    if (frame.type === 'end') attempts.delete(frame.attemptId)
  }, { global: true })
  ctx.on('tools/pre-execute', async (exec, next) => {
    const destructive = ['write', 'edit', 'apply_patch', 'bash', 'terminal_open', 'terminal_send', 'plugin_manager'].includes(exec.name)
    if (config.permissionMode === 'plan-only' && destructive) return { kind: 'deny', reason: '此会话为只读规划，禁止写入和命令执行。' }
    const decision = await next()
    if (decision.kind !== 'allow') return decision
    if (config.permissionMode === 'ask-destructive' && destructive) return { kind: 'ask', reason: '写入文件或执行命令前需要你的确认。' }
    return decision
  }, { global: true })

  ctx.tools.register(defineTool({
    name: 'create_artifact',
    description: 'Create a self-contained HTML, SVG, Mermaid, Markdown or code artifact for the Aster workspace. Save important deliverables with write as well.',
    parameters: {
      title: { type: 'string', required: true },
      kind: { type: 'string', required: true, enum: ['html', 'svg', 'mermaid', 'markdown', 'code'] },
      content: { type: 'string', required: true },
      language: { type: 'string' },
    },
    output: { schema: { type: 'object', properties: { artifactId: { type: 'string', required: true } }, additionalProperties: false }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      exec.signal.throwIfAborted()
      const artifact = { id: `art-${exec.callId}`, title: args.title, kind: args.kind, content: args.content, ...(args.language ? { language: args.language } : {}) }
      notify('aster.artifact', { sessionId: exec.agent.session.id, artifact })
      return { artifactId: artifact.id }
    },
  }))

  if (config.webSearchEnabled) {
    const toolsModule = import(config.webToolsModule)
    for (const definition of config.webDefinitions) {
      // The native registry validates input and owns cancellation/logging.
      ctx.tools.register({
        ...definition,
        output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
        isConcurrencySafe: () => true,
        async execute(args, exec) {
          const { executeHarnessToolCall } = await toolsModule
          return executeHarnessToolCall({ id: exec.callId, name: definition.name, arguments: JSON.stringify(args) }, {
            workspaceDir: config.workspaceDir, profile: config.profile, apiKey: '', permissionMode: 'plan-only',
            allowedToolNames: new Set(['web_search', 'web_fetch']), skills: [], signal: exec.signal,
            emitActivity() {}, emitTodos() {}, emitArtifact() {},
            emitCitations: citations => notify('aster.citations', { sessionId: exec.agent.session.id, citations }),
            requestApproval: async () => 'deny', requestAskUser: async () => ({}),
          })
        },
      })
    }
  }
  notify('aster.ready', { sessionId: '', version: 1 })
}
