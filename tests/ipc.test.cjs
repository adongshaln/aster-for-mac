require('./register.cjs')
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-ipc-test-'))
const handlers = new Map()
const noop = () => {}
class BrowserWindow {
  constructor() { this.webContents = { setWindowOpenHandler: noop, on: noop, getURL: () => '', send: noop }; this.on = noop; this.once = noop }
  loadFile() { return Promise.resolve() }
  loadURL() { return Promise.resolve() }
}
const electron = {
  app: { setName: noop, getPath: () => temp, requestSingleInstanceLock: () => true, whenReady: () => Promise.resolve(), on: noop },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s), decryptString: b => b.toString() },
  BrowserWindow, protocol: { registerSchemesAsPrivileged: noop, handle: noop },
  ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, nativeTheme: {},
  Menu: { buildFromTemplate: value => value, setApplicationMenu: noop }, dialog: {}, screen: {}, shell: {},
}
const originalLoad = Module._load
Module._load = function (id, ...args) { return id === 'electron' ? electron : id === './harness' ? { streamHarness: (...params) => require('../electron/api.ts').streamChat(...params) } : originalLoad.call(this, id, ...args) }
const { saveConfig } = require('../electron/store.ts')
saveConfig({ version: 1, activeProfileId: 'b', profiles: ['a', 'b'].map(id => ({ id, name: id, baseUrl: `https://${id}.invalid`, apiKey: `test-key-${id}` })), settings: { theme: 'system' } })
require('../electron/main.ts')
const originalFetch = global.fetch
after(() => { global.fetch = originalFetch; fs.rmSync(temp, { recursive: true, force: true }) })

test('image IPC uses the explicit service and refuses missing services without fallback', async () => {
  await new Promise(resolve => setImmediate(resolve))
  const requests = []
  global.fetch = async (url, options) => {
    requests.push({ url, options })
    return new Response(JSON.stringify({ data: [{ b64_json: 'eA==' }] }), { headers: { 'content-type': 'application/json' } })
  }
  const generate = handlers.get('images:generate')
  const result = await generate({}, { profileId: 'a', prompt: 'private', model: 'test-image', size: '1024x1024' })
  assert.equal(result.images.length, 1)
  assert.match(requests[0].url, /^https:\/\/a\.invalid\//)
  assert.equal(requests[0].options.headers.Authorization, 'Bearer test-key-a')
  await assert.rejects(generate({}, { profileId: 'deleted', prompt: 'private', model: 'test-image' }), /配置不存在/)
  await assert.rejects(generate({}, { prompt: 'private', model: 'test-image' }), /配置不存在/)
  assert.equal(requests.length, 1)
})

test('chat stop settles pending approvals and releases the request id', async () => {
  const target = path.join(temp, 'late-write.txt')
  const events = []
  const request = { requestId: 'cancel-test', profileId: 'a', model: 'mock-chat', systemPrompt: '', messages: [{ role: 'user', content: 'test' }], contextLimit: 128000, effort: 'default', workspaceDir: temp, harnessToolsEnabled: true, webSearchEnabled: false, permissionMode: 'ask-destructive' }
  const event = { sender: { isDestroyed: () => false, send: (_channel, payload) => events.push(payload) } }
  global.fetch = async () => new Response(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c', function: { name: 'write', arguments: JSON.stringify({ file_path: target, content: 'bad' }) } }] }, finish_reason: 'tool_calls' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } })
  for (let repeat = 0; repeat < 2; repeat++) {
    events.length = 0
    handlers.get('chat:start')(event, request)
    for (let attempt = 0; !events.some(e => e.type === 'tool_approval') && attempt < 20; attempt++) {
      await new Promise(resolve => setImmediate(resolve))
    }
    assert.ok(events.some(e => e.type === 'tool_approval'))
    await handlers.get('chat:stop')({}, request.requestId)
    handlers.get('chat:approveTool')({}, request.requestId, 'c', 'allow_once')
    assert.ok(events.some(e => e.type === 'stopped'))
    assert.equal(fs.existsSync(target), false)
  }
})

test('deleting a conversation removes its native runtime history and preserves other conversations', async () => {
  const save = handlers.get('conversations:save')
  await save({}, [{ id: 'delete-me', messages: [] }, { id: 'keep-me', messages: [] }])
  const runtime = path.join(temp, 'aster', 'runtime')
  for (const id of ['delete-me', 'keep-me']) { fs.mkdirSync(path.join(runtime, id), { recursive: true }); fs.writeFileSync(path.join(runtime, id, 'evidence'), 'private task history') }
  await save({}, [{ id: 'keep-me', messages: [] }])
  assert.equal(fs.existsSync(path.join(runtime, 'delete-me')), false)
  assert.equal(fs.existsSync(path.join(runtime, 'keep-me', 'evidence')), true)
})

test('artifact export writes the chosen file and respects a cancelled save dialog', async () => {
  const target = path.join(temp, 'artifact.md')
  electron.dialog.showSaveDialog = async () => ({ canceled: false, filePath: target })
  const exportArtifact = handlers.get('app:exportArtifact')
  assert.equal(await exportArtifact({}, { title: '成果', kind: 'markdown', content: '# 完整成果\n' }), target)
  assert.equal(fs.readFileSync(target, 'utf8'), '# 完整成果\n')
  electron.dialog.showSaveDialog = async () => ({ canceled: true })
  assert.equal(await exportArtifact({}, { title: '成果', kind: 'markdown', content: 'cancelled' }), null)
  assert.equal(fs.readFileSync(target, 'utf8'), '# 完整成果\n')
})
