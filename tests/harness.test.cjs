// Exercises the actual pinned SDK, native tools and standalone Node runtime.
require('./register.cjs')
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http'), Module = require('node:module')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-harness-test-'))
const originalLoad = Module._load
Module._load = function(id, ...args) { return id === 'electron' ? { app: { getPath: () => temp } } : originalLoad.call(this, id, ...args) }
const { streamHarness } = require('../dist-electron/electron/harness.js')
const marker = 'native-tool-history-marker'
fs.writeFileSync(path.join(temp, 'fixture.txt'), marker)
let respond, profile, calls = []
const server = http.createServer(async (req, res) => {
  try {
    let raw = ''; for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw)
    assert.equal(req.url, profile.apiFormat === 'anthropic' ? profile.messagesPath : body.model.startsWith('gpt-') ? profile.responsesPath : profile.chatPath)
    calls.push(body)
    assert.equal(profile.apiFormat === 'anthropic' ? req.headers['x-api-key'] : req.headers.authorization, profile.apiFormat === 'anthropic' ? 'TEST_KEY' : 'Bearer TEST_KEY')
    assert.equal(req.headers['x-aster-test'], 'preserved')
    await respond(body, res)
  } catch (error) { res.statusCode = 500; res.end(JSON.stringify({ error: { message: error.message } })) }
})
const ready = new Promise(resolve => server.listen(0, '127.0.0.1', () => {
  profile = { id: 'p', name: 'test', baseUrl: `http://127.0.0.1:${server.address().port}`, apiFormat: 'openai', chatPath: '/custom/chat', extraHeaders: 'x-aster-test: preserved', models: [] }
  resolve()
}))
function stream(res, { text, tool, args, id = 'call', inputTokens = 9 } = {}) {
  res.setHeader('content-type', 'text/event-stream')
  const data = delta => res.write(`data: ${JSON.stringify({ id: 'reply', object: 'chat.completion.chunk', created: 1, model: 'mock-chat', choices: [{ index: 0, ...delta }] })}\n\n`)
  data({ delta: { role: 'assistant', ...(tool ? { tool_calls: [{ index: 0, id, type: 'function', function: { name: tool, arguments: JSON.stringify(args) } }] } : { content: text ?? '完成' }) }, finish_reason: null })
  data({ delta: {}, finish_reason: tool ? 'tool_calls' : 'stop' })
  res.write(`data: ${JSON.stringify({ id: 'reply', object: 'chat.completion.chunk', choices: [], usage: { prompt_tokens: inputTokens, completion_tokens: 3, total_tokens: inputTokens + 3 } })}\n\n`)
  res.end('data: [DONE]\n\n')
}
async function run(conversationId, messages, options = {}, callback) {
  await ready
  const events = []
  await streamHarness(profile, 'TEST_KEY', { requestId: 'r', conversationId, profileId: 'p', model: 'mock-chat', systemPrompt: 'Complete the task.', contextLimit: 32000, messages, workspaceDir: temp, harnessToolsEnabled: true, webSearchEnabled: false, permissionMode: 'auto', effort: 'default', ...options }, event => { events.push(event); callback?.(event) }, options.signal ?? new AbortController().signal, options.callbacks ?? {})
  return events
}
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(temp, { recursive: true, force: true }) })

test('native dsh completes 24 tool steps, restores full history and forks regeneration', { timeout: 60000 }, async () => {
  let step = 0
  calls = []
  respond = (body, res) => ++step <= 24 ? stream(res, { tool: 'read', args: { file_path: path.join(temp, 'fixture.txt') }, id: `read-${step}` }) : stream(res, { text: '24 步已完成' })
  const first = await run('history', [{ role: 'user', content: 'first task' }])
  assert.equal(step, 25)
  assert.equal(first.filter(e => e.type === 'tool' && e.activity.status === 'completed').length, 24)
  assert.equal(first.filter(e => e.type === 'delta').map(e => e.text).join(''), '24 步已完成')
  assert.equal(first.at(-1).type, 'done')
  assert.equal(first.at(-1).usage.totalTokens, 25 * 12)
  const firstDelta = first.findIndex(e => e.type === 'delta')
  assert.ok(firstDelta < first.findLastIndex(e => e.type === 'usage'))
  calls = []
  respond = (body, res) => stream(res, { text: 'continued' })
  await run('history', [{ role: 'user', content: 'first task' }, { role: 'assistant', content: '24 步已完成' }, { role: 'user', content: 'continue task' }])
  assert.equal(calls[0].messages.filter(m => m.role === 'tool').length, 24)
  assert.match(JSON.stringify(calls[0].messages), new RegExp(marker))
  const nextWorkspace = path.join(temp, 'new-workspace')
  fs.mkdirSync(nextWorkspace)
  let directoryStep = 0
  respond = (body, res) => ++directoryStep === 1 ? stream(res, { tool: 'working_directory', args: {} }) : stream(res, { text: 'workspace verified' })
  const moved = await run('history', [{ role: 'user', content: 'first task' }, { role: 'assistant', content: '24 步已完成' }, { role: 'user', content: 'continue task' }, { role: 'assistant', content: 'continued' }, { role: 'user', content: 'check workspace' }], { workspaceDir: nextWorkspace })
  assert.ok(moved.some(e => e.type === 'tool' && e.activity.output?.includes(nextWorkspace)))
  respond = (body, res) => stream(res, { text: 'continued' })
  calls = []
  await run('history', [{ role: 'user', content: 'first task' }])
  assert.equal(calls[0].messages.filter(m => m.role === 'tool').length, 0)
})

test('native tools enforce read-only policy and publish artifacts', { timeout: 30000 }, async () => {
  let step = 0
  const target = path.join(temp, 'forbidden.txt')
  respond = (body, res) => ++step === 1 ? stream(res, { tool: 'write', args: { file_path: target, content: 'forbidden' } }) : stream(res, { text: 'denied' })
  const events = await run('readonly', [{ role: 'user', content: 'try write' }], { permissionMode: 'plan-only' })
  assert.equal(fs.existsSync(target), false)
  assert.ok(events.some(e => e.type === 'tool' && e.activity.status === 'failed'))
  step = 0
  respond = (body, res) => ++step === 1 ? stream(res, { tool: 'create_artifact', args: { title: '图表', kind: 'mermaid', content: 'graph TD; A-->B' } }) : stream(res)
  const artifacts = await run('artifact', [{ role: 'user', content: 'diagram' }])
  assert.ok(artifacts.some(e => e.type === 'artifact' && e.artifact.kind === 'mermaid'))
})

test('approval cancellation settles the real runtime and prevents the write', { timeout: 30000 }, async () => {
  const target = path.join(temp, 'cancelled.txt')
  respond = (body, res) => stream(res, { tool: 'write', args: { file_path: target, content: 'bad' } })
  const controller = new AbortController()
  const events = await run('cancel', [{ role: 'user', content: 'write' }], { permissionMode: 'ask-destructive', signal: controller.signal, callbacks: { requestApproval: () => new Promise(() => {}) } }, event => { if (event.type === 'tool_approval') controller.abort() })
  assert.equal(fs.existsSync(target), false)
  assert.equal(events.at(-1).type, 'stopped')
})

test('native provider retries a transient 429', { timeout: 30000 }, async () => {
  let count = 0
  respond = (body, res) => { if (++count === 1) { res.statusCode = 429; res.setHeader('retry-after', '0'); res.end('{"error":{"message":"retry"}}') } else stream(res, { text: 'retried' }) }
  const events = await run('retry', [{ role: 'user', content: 'retry task' }])
  assert.equal(count, 2)
  assert.equal(events.at(-1).type, 'done')
})

module.exports = { stream }

test('native subagents keep tools and account for child usage', { timeout: 30000 }, async () => {
  let childRequests = 0
  respond = async (body, res) => {
    const child = body.messages.some(m => typeof m.content === 'string' && m.content.includes('child-native-check'))
    const toolMessages = body.messages.filter(m => m.role === 'tool')
    if (child) {
      childRequests++
      return toolMessages.length ? stream(res, { text: 'child verified' }) : stream(res, { tool: 'read', args: { file_path: path.join(temp, 'fixture.txt') } })
    }
    if (!toolMessages.length) return stream(res, { tool: 'subagent', args: { description: 'Verify native child tools', prompt: 'child-native-check: read fixture.txt and report.', name: 'checker' } })
    await new Promise(resolve => setTimeout(resolve, 500))
    stream(res, { text: 'parent verified' })
  }
  const events = await run('child', [{ role: 'user', content: 'delegate a check' }])
  assert.ok(childRequests >= 2)
  assert.ok(events.some(e => e.type === 'tool' && e.activity.name === 'read' && e.activity.status === 'completed'))
  assert.ok(events.at(-1).usage.totalTokens >= 48)
})

test('native background job completes beyond the former 30 second timeout', { timeout: 55000 }, async () => {
  let step = 0
  respond = (body, res) => {
    if (++step === 1) return stream(res, { tool: 'bash', args: { description: 'Verify long background work', command: 'sleep 31; printf long-job-completed', run_in_background: true } })
    const tools = body.messages.filter(m => m.role === 'tool')
    if (step === 2) {
      const match = /started background job (\S+)/.exec(String(tools.at(-1).content))
      assert.ok(match, JSON.stringify(tools.at(-1)))
      return stream(res, { tool: 'job_output', args: { job_id: match[1], wait: true, timeout_ms: 40000 }, id: 'job-wait' })
    }
    assert.match(JSON.stringify(tools.at(-1)), /long-job-completed/)
    stream(res, { text: 'long job verified' })
  }
  const events = await run('long-job', [{ role: 'user', content: 'run background work' }])
  assert.equal(events.at(-1).type, 'done')
  assert.equal(events.filter(e => e.type === 'tool' && e.activity.status === 'completed').length, 2)
})

test('native context compression and enabled web tools load in the real deployment', { timeout: 30000 }, async () => {
  let summaries = 0
  let progressed = 0
  fs.writeFileSync(path.join(temp, 'context.txt'), Array.from({length:80}, (_,i) => `fact ${i}: ` + 'evidence ' .repeat(15)).join('\n'))
  let toolsReady = false
  respond = (body, res) => {
    if (JSON.stringify(body.messages.at(-1)).includes('acting as a compaction engine')) { summaries++; return stream(res, { text: 'COMPRESSED: retain the user task and prior evidence.' }) }
    if (++progressed <= 5) return stream(res, { tool: 'read', args: { file_path: path.join(temp, 'context.txt') }, id: `context-${progressed}`, inputTokens: 100000 })
    toolsReady = body.tools.some(t => t.function.name === 'web_search') && body.tools.some(t => t.function.name === 'web_fetch')
    stream(res, { text: 'compacted task complete' })
  }
  const events = await run('compact', [{ role: 'user', content: 'Old context evidence. '.repeat(18000) + 'Complete the current task.' }], { webSearchEnabled: true })
  assert.ok(summaries > 0)
  assert.ok(toolsReady)
  assert.ok(events.some(e => e.type === 'status' && e.message.includes('整理任务上下文')))
  assert.equal(events.at(-1).type, 'done')
})

test('native Anthropic and Responses adapters retain configured routes and stream output', { timeout: 30000 }, async () => {
  await ready
  const before = { ...profile }
  try {
    profile.apiFormat = 'anthropic'; profile.messagesPath = '/custom/messages'
    respond = (body, res) => {
      res.setHeader('content-type', 'text/event-stream')
      const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`)
      send('message_start', { message: { id: 'msg', type: 'message', role: 'assistant', model: 'mock-claude', content: [], stop_reason: null, usage: { input_tokens: 7, output_tokens: 0, cache_read_input_tokens: 2 } } })
      send('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
      send('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'anthropic native' } })
      send('content_block_stop', { index: 0 })
      send('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 3 } })
      send('message_stop', {}); res.end()
    }
    const anthropic = await run('anthropic-native', [{ role: 'user', content: 'test' }], { model: 'mock-claude' })
    assert.equal(anthropic.filter(e => e.type === 'delta').map(e => e.text).join(''), 'anthropic native')
    assert.equal(anthropic.at(-1).usage.inputTokens, 9)
    profile.apiFormat = 'openai'; profile.responsesPath = '/custom/responses'
    respond = (body, res) => {
      res.setHeader('content-type', 'text/event-stream')
      const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`)
      const item = { type: 'message', id: 'msg', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'responses native', annotations: [] }] }
      send('response.created', { response: { id: 'resp', model: 'gpt-test', status: 'in_progress', output: [] } })
      send('response.output_item.added', { output_index: 0, item: { ...item, status: 'in_progress', content: [] } })
      send('response.content_part.added', { item_id: 'msg', output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } })
      send('response.output_text.delta', { item_id: 'msg', output_index: 0, content_index: 0, delta: 'responses native' })
      send('response.output_item.done', { output_index: 0, item })
      send('response.completed', { response: { id: 'resp', model: 'gpt-test', status: 'completed', output: [item], usage: { input_tokens: 7, output_tokens: 3, total_tokens: 10 } } }); res.end()
    }
    const responses = await run('responses-native', [{ role: 'user', content: 'test' }], { model: 'gpt-test' })
    assert.equal(responses.filter(e => e.type === 'delta').map(e => e.text).join(''), 'responses native')
    assert.equal(responses.at(-1).type, 'done')
  } finally { profile = before }
})
