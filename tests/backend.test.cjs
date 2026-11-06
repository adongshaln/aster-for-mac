require('./register.cjs')
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-backend-test-'))
const originalLoad = Module._load
Module._load = function (id, ...args) {
  if (id === 'electron') return {
    app: { getPath: () => temp },
    safeStorage: { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s), decryptString: b => b.toString() },
  }
  return originalLoad.call(this, id, ...args)
}
const { streamChat } = require('../electron/api.ts')
const { executeHarnessToolCall, buildHarnessToolDefinitions } = require('../electron/tools.ts')
const { waitForInteraction } = require('../electron/async.ts')
const originalFetch = global.fetch
after(() => { global.fetch = originalFetch; fs.rmSync(temp, { recursive: true, force: true }) })

const profile = {
  id: 'p', name: 'test', baseUrl: 'https://test.invalid', apiFormat: 'openai',
  chatPath: '/v1/chat/completions', responsesPath: '/v1/responses', messagesPath: '/v1/messages',
  modelsPath: '/v1/models', extraHeaders: '', models: [], contextLimit: 128000, reasoningEffort: 'default',
}
const request = {
  requestId: 'r', profileId: 'p', model: 'mock-chat', systemPrompt: '',
  messages: [{ role: 'user', content: 'test' }], effort: 'default', contextLimit: 128000,
  workspaceDir: temp, webSearchEnabled: false, harnessToolsEnabled: false, permissionMode: 'plan-only',
}
function sse(events) {
  return new Response(events.map(e => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join(''), {
    headers: { 'content-type': 'text/event-stream' },
  })
}
const chunk = (content, finish_reason = null) => ({ choices: [{ delta: { content }, finish_reason }] })
async function chat(events, options = {}, customProfile = profile, callbacks = {}) {
  global.fetch = async () => sse(events)
  const emitted = []
  await streamChat(customProfile, '', { ...request, ...options }, e => emitted.push(e), new AbortController().signal, callbacks)
  return emitted
}
function context(options = {}) {
  return {
    workspaceDir: temp, profile, apiKey: '', permissionMode: 'auto', skills: [],
    allowedToolNames: new Set(['read', 'write', 'edit', 'bash', 'glob', 'grep', 'ask_user_question']),
    signal: new AbortController().signal,
    emitActivity() {}, emitCitations() {}, emitTodos() {}, emitArtifact() {},
    requestApproval: async () => 'allow_once', requestAskUser: async () => ({}), ...options,
  }
}
const call = (name, args) => ({ id: 'call', name, arguments: JSON.stringify(args) })
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

test('Chat Completions consumes usage after finish_reason, across network chunks', async () => {
  const events = [chunk('hello'), chunk('', 'stop'), { choices: [], usage: { prompt_tokens: 123, completion_tokens: 7, total_tokens: 130 } }, '[DONE]']
  const encoded = new TextEncoder().encode(events.map(e => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\r\n\r\n`).join(''))
  global.fetch = async () => new Response(new ReadableStream({
    start(controller) {
      for (let i = 0; i < encoded.length; i += 7) controller.enqueue(encoded.slice(i, i + 7))
      controller.close()
    },
  }), { headers: { 'content-type': 'text/event-stream' } })
  const emitted = []
  await streamChat(profile, '', request, e => emitted.push(e), new AbortController().signal)
  assert.equal(emitted.find(e => e.type === 'done').usage.totalTokens, 130)
  assert.equal(emitted.filter(e => e.type === 'delta').map(e => e.text).join(''), 'hello')
})

test('partial EOF is rejected and never emits done or executes incomplete tool calls', async () => {
  let wrote = false
  const target = path.join(temp, 'incomplete.txt')
  const events = [chunk('partial'), { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c', function: { name: 'write', arguments: JSON.stringify({ file_path: target, content: 'bad' }) } }] }, finish_reason: null }] }]
  global.fetch = async () => sse(events)
  await assert.rejects(streamChat(profile, '', { ...request, harnessToolsEnabled: true, permissionMode: 'auto' }, e => { if (e.type === 'done') wrote = true }, new AbortController().signal), /提前结束/)
  assert.equal(wrote, false)
  assert.equal(fs.existsSync(target), false)
})

test('length-limited text remains continuable instead of reporting success', async () => {
  const events = await chat([chunk('partial', 'length'), '[DONE]'])
  assert.ok(events.some(e => e.type === 'stopped'))
  assert.ok(!events.some(e => e.type === 'done'))
})

test('execution rejects tools omitted from the request and destructive calls in plan-only mode', async () => {
  const target = path.join(temp, 'forbidden.txt')
  for (const permissionMode of ['auto', 'ask-destructive', 'plan-only']) {
    const result = await executeHarnessToolCall(call('write', { file_path: target, content: 'bad' }), context({ allowedToolNames: new Set(), permissionMode }))
    assert.equal(JSON.parse(result).error, 'tool_not_allowed')
  }
  const result = await executeHarnessToolCall(call('write', { file_path: target, content: 'bad' }), context({ permissionMode: 'plan-only' }))
  assert.equal(JSON.parse(result).error, 'tool_not_allowed')
  assert.equal(fs.existsSync(target), false)
  const definitions = buildHarnessToolDefinitions({ webSearchEnabled: false, harnessToolsEnabled: true, permissionMode: 'plan-only', skills: [] })
  assert.ok(!definitions.some(d => ['bash', 'write', 'edit'].includes(d.name)))
})

test('server tool calls cannot bypass disabled Harness at the chat boundary', async () => {
  const target = path.join(temp, 'server-forbidden.txt')
  let round = 0
  global.fetch = async () => round++ === 0
    ? sse([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c', function: { name: 'write', arguments: JSON.stringify({ file_path: target, content: 'bad' }) } }] }, finish_reason: 'tool_calls' }] }, '[DONE]'])
    : sse([chunk('done', 'stop'), '[DONE]'])
  const activities = []
  await streamChat(profile, '', request, e => { if (e.type === 'tool') activities.push(e.activity) }, new AbortController().signal)
  assert.equal(fs.existsSync(target), false)
  assert.equal(activities[0].status, 'failed')
})

test('approval and question registries settle and remove entries on cancel', async () => {
  for (const type of ['approval', 'question']) {
    const pending = new Map()
    const controller = new AbortController()
    const waiting = waitForInteraction(pending, type, controller.signal)
    const rejected = assert.rejects(waiting, { name: 'AbortError' })
    controller.abort()
    await rejected
    assert.equal(pending.size, 0)
  }
  const pending = new Map()
  const waiting = waitForInteraction(pending, 'normal', new AbortController().signal)
  pending.get('normal')('yes')
  assert.equal(await waiting, 'yes')
  assert.equal(pending.size, 0)
})

test('cancelled tool never writes when a delayed approval arrives', async () => {
  const target = path.join(temp, 'late-approval.txt')
  const controller = new AbortController()
  let approve
  const running = executeHarnessToolCall(call('write', { file_path: target, content: 'bad' }), context({
    permissionMode: 'ask-destructive', signal: controller.signal,
    requestApproval: () => new Promise(resolve => { approve = resolve }),
  }))
  const rejected = assert.rejects(running, { name: 'AbortError' })
  controller.abort()
  approve('allow_once')
  await rejected
  assert.equal(fs.existsSync(target), false)
})

test('cancelled question stops waiting even if its callback never settles', async () => {
  const controller = new AbortController()
  const running = executeHarnessToolCall(call('ask_user_question', { questions: [{ id: 'q', question: 'choose' }] }), context({
    signal: controller.signal, requestAskUser: () => new Promise(() => {}),
  }))
  const rejected = assert.rejects(running, { name: 'AbortError' })
  controller.abort()
  await rejected
})

test('terminal returns normal output and nonzero exit codes', async () => {
  const output = await executeHarnessToolCall(call('bash', { command: 'printf "中文输出"; exit 7' }), context())
  assert.match(output, /中文输出/)
  assert.match(output, /exit code: 7/)
})

test('terminal cancellation kills descendants, including ones ignoring SIGTERM', async () => {
  const sentinel = path.join(temp, 'child-survived.txt')
  const controller = new AbortController()
  let started
  const ready = new Promise(resolve => { started = resolve })
  const command = `trap '' TERM; (trap '' TERM; sleep 0.8; echo survived > child-survived.txt) & echo ready; wait`
  const running = executeHarnessToolCall(call('bash', { command }), context({ signal: controller.signal, emitActivity: a => { if (a.status === 'running') started() } }))
  const rejected = assert.rejects(running, { name: 'AbortError' })
  await ready
  await delay(100)
  controller.abort()
  await rejected
  await delay(850)
  assert.equal(fs.existsSync(sentinel), false)
})

test('literal edit preserves replacement dollar sequences', async () => {
  const file = path.join(temp, 'literal.txt')
  const replacement = "$& $$ $` $'"
  for (const replace_all of [false, true]) {
    fs.writeFileSync(file, 'before TARGET after')
    await executeHarnessToolCall(call('edit', { file_path: file, old_string: 'TARGET', new_string: replacement, replace_all }), context())
    assert.equal(fs.readFileSync(file, 'utf8'), `before ${replacement} after`)
  }
})

test('glob matches nested paths and grep supports an explicit file and include patterns', async () => {
  const dir = fs.mkdtempSync(path.join(temp, 'search-'))
  fs.mkdirSync(path.join(dir, 'src', 'nested'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src', 'a.ts'), 'needle one')
  fs.writeFileSync(path.join(dir, 'src', 'nested', 'b.tsx'), 'needle two')
  fs.writeFileSync(path.join(dir, 'src', 'not-a.ts.bak'), 'needle backup')
  const glob = await executeHarnessToolCall(call('glob', { path: dir, pattern: 'src/**/*.{ts,tsx}' }), context())
  assert.deepEqual(glob.split('\n').sort(), ['src/a.ts', 'src/nested/b.tsx'])
  const file = await executeHarnessToolCall(call('grep', { path: path.join(dir, 'src', 'a.ts'), pattern: 'needle' }), context())
  assert.match(file, /a\.ts:1: needle one/)
  const filtered = await executeHarnessToolCall(call('grep', { path: dir, pattern: 'needle', include: 'src/**/*.ts' }), context())
  assert.equal(filtered, 'src/a.ts:1: needle one')
})

test('Anthropic replays ordered thinking, signatures and redacted blocks and totals cached input', async () => {
  let round = 0
  const bodies = []
  global.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body))
    return round++ === 0 ? sse([
      { type: 'message_start', message: { usage: { input_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 20 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'reason' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'signature' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'redacted_thinking', data: 'opaque' } },
      { type: 'content_block_stop', index: 1 },
      { type: 'content_block_start', index: 2, content_block: { type: 'text', text: 'working' } },
      { type: 'content_block_stop', index: 2 },
      { type: 'content_block_start', index: 3, content_block: { type: 'tool_use', id: 'c', name: 'todo_write', input: {} } },
      { type: 'content_block_delta', index: 3, delta: { type: 'input_json_delta', partial_json: '{"todos":[]}' } },
      { type: 'content_block_stop', index: 3 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 3 } },
      { type: 'message_stop' },
    ]) : sse([
      { type: 'message_start', message: { usage: { input_tokens: 2 } } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'finished' } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
      { type: 'message_stop' },
    ])
  }
  const emitted = []
  await streamChat({ ...profile, apiFormat: 'anthropic' }, '', { ...request, model: 'claude-sonnet-4-5', effort: 'low', harnessToolsEnabled: true }, e => emitted.push(e), new AbortController().signal)
  assert.deepEqual(bodies[1].messages.find(m => m.role === 'assistant').content, [
    { type: 'thinking', thinking: 'reason', signature: 'signature' },
    { type: 'redacted_thinking', data: 'opaque' }, { type: 'text', text: 'working' },
    { type: 'tool_use', id: 'c', name: 'todo_write', input: { todos: [] } },
  ])
  const usage = emitted.find(e => e.type === 'done').usage
  assert.equal(usage.inputTokens, 127)
  assert.equal(usage.cachedTokens, 100)
  assert.equal(usage.cacheWriteTokens, 20)
  assert.equal(usage.totalTokens, 131)
})

test('Responses tool continuation retains response id and function call output', async () => {
  let round = 0
  const bodies = []
  global.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body))
    return round++ === 0 ? sse([
      { type: 'response.created', response: { id: 'resp-1' } },
      { type: 'response.output_item.done', item: { type: 'function_call', id: 'item-1', call_id: 'c1', name: 'todo_write', arguments: '{"todos":[]}' } },
      { type: 'response.completed', response: { id: 'resp-1', usage: { input_tokens: 4, output_tokens: 2 } } },
    ]) : sse([{ type: 'response.output_text.delta', delta: 'done' }, { type: 'response.completed', response: { id: 'resp-2', usage: { input_tokens: 6, output_tokens: 3 } } }])
  }
  const emitted = []
  await streamChat(profile, '', { ...request, model: 'gpt-5', harnessToolsEnabled: true }, e => emitted.push(e), new AbortController().signal)
  assert.equal(bodies[1].previous_response_id, 'resp-1')
  assert.equal(bodies[1].input[0].type, 'function_call_output')
  assert.equal(bodies[1].input[0].call_id, 'c1')
  assert.equal(emitted.find(e => e.type === 'done').usage.totalTokens, 15)
})

test('existing pure-mode serialization still decodes its display stream', async () => {
  let body
  global.fetch = async (_url, options) => {
    body = JSON.parse(options.body)
    const toolName = body.tools[0].function.name
    return sse([
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'tunnel', function: { name: toolName, arguments: '{"display_stream":"unchanged output"}' } }] }, finish_reason: 'tool_calls' }] },
      '[DONE]',
    ])
  }
  const emitted = []
  await streamChat(profile, '', {
    ...request, injectionPureMode: true,
    injectionEntries: [{ id: 'test', name: 'test', role: 'system', position: 'before_history', enabled: true, content: 'test preset content' }],
  }, e => emitted.push(e), new AbortController().signal)
  assert.match(body.tools[0].function.name, /^dispatch_stream_payload_/)
  assert.ok(body.tools[0].function.description.includes('test preset content'))
  assert.equal(emitted.filter(e => e.type === 'delta').map(e => e.text).join(''), 'unchanged output')
  assert.ok(emitted.some(e => e.type === 'done'))
})
