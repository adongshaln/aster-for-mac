require('./register.cjs')
const { test, before, beforeEach, after } = require('node:test')
const assert = require('node:assert/strict')
const React = require('react')

let chatListener
let chatRequests = []
let imageRequests = []
let answers = []
const profile = id => ({ id, name: id.toUpperCase(), baseUrl: `https://${id}.invalid`, chatModel: `${id}-chat`, reasoningEffort: 'default', contextLimit: 128000, models: [] })
const config = () => ({ version: 1, activeProfileId: 'b', profiles: [profile('a'), profile('b')], settings: { theme: 'system', userName: 'original', systemPrompt: '', promptInjectionEnabled: false, skills: [] } })
const conversation = (id = 'a') => ({ id: `conv-${id}`, profileId: id, model: `${id}-chat`, title: id, messages: [], createdAt: 1, updatedAt: 1 })
global.window = {
  addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
  aster: {
    app: { setTheme: async () => {}, info: async () => ({}), windowState: async () => ({ fullscreen: false }), onWindowState: () => () => {} },
    config: { load: async () => config(), save: async value => value },
    conversations: { load: async () => [], save: async () => {} },
    chat: {
      onEvent: callback => { chatListener = callback; return () => {} }, start: async request => { chatRequests.push(request) },
      stop: async () => {}, answerQuestion: async (...args) => { answers.push(args) },
    },
    images: { generate: async request => { imageRequests.push(request); return { images: [] } } },
    models: { fetch: async () => ({ models: [], latencyMs: 1 }) },
  },
}
global.document = { documentElement: { classList: { toggle() {} }, dataset: {}, style: {} } }
const { useAppStore, activeProfile } = require('../src/state/store.ts')
const { ModelPicker } = require('../src/components/ModelPicker.tsx')
before(async () => { await useAppStore.getState().init() })
beforeEach(() => {
  chatRequests = []; imageRequests = []; answers = []
  useAppStore.setState({ config: config(), conversations: [], activeId: null, activeRequest: null, pendingQuestion: null, pendingApproval: null })
})
after(() => { useAppStore.getState().dismissToast() })

test('empty view and model selection use the configured default service', async () => {
  assert.equal(activeProfile(useAppStore.getState()).id, 'b')
  await useAppStore.getState().chooseModel('selected-model')
  assert.equal(activeProfile(useAppStore.getState()).chatModel, 'selected-model')
  assert.equal(useAppStore.getState().config.profiles[0].chatModel, 'a-chat')
  const id = useAppStore.getState().createConversation()
  const created = useAppStore.getState().conversations.find(c => c.id === id)
  assert.equal(created.profileId, 'b')
  assert.equal(created.model, 'selected-model')
})

test('deleted service blocks sends until the user explicitly rebinds the conversation', async () => {
  const old = conversation('deleted')
  useAppStore.setState({ conversations: [old], activeId: old.id })
  assert.equal(activeProfile(useAppStore.getState()), undefined)
  await useAppStore.getState().sendMessage('private history', [])
  assert.equal(chatRequests.length, 0)
  useAppStore.getState().setConversationProfile('b')
  await useAppStore.getState().sendMessage('private history', [])
  assert.equal(chatRequests[0].profileId, 'b')
  assert.equal(chatRequests[0].model, 'b-chat')
})

test('images carry the same service shown for the conversation, despite another default', async () => {
  const current = conversation()
  useAppStore.setState({ conversations: [current], activeId: current.id })
  await useAppStore.getState().generateImage('prompt', 'a-image', '1024x1024')
  assert.equal(imageRequests[0].profileId, 'a')
  assert.equal(useAppStore.getState().conversations[0].messages[0].profileId, 'a')
  useAppStore.setState({ conversations: [conversation('deleted')], activeId: 'conv-deleted' })
  await assert.rejects(useAppStore.getState().generateImage('prompt', 'image', '1024x1024'))
  assert.equal(imageRequests.length, 1)
})

test('multiple questions preserve partial answers and submit exactly one complete answer map', async () => {
  useAppStore.setState({ activeRequest: { requestId: 'r', messageId: 'm', conversationId: 'c', startedAt: Date.now() } })
  chatListener({ type: 'ask_user', requestId: 'r', callId: 'call', questions: [{ id: 'q1', question: 'first' }, { id: 'q2', question: 'second' }] })
  await useAppStore.getState().resolveUserQuestion({ q1: 'one' })
  assert.equal(answers.length, 0)
  assert.deepEqual(useAppStore.getState().pendingQuestion.answers, { q1: 'one' })
  await useAppStore.getState().resolveUserQuestion({ q1: 'changed', unknown: 'ignored' })
  await useAppStore.getState().resolveUserQuestion({ q2: 'two' })
  assert.equal(useAppStore.getState().pendingQuestion, null)
  assert.deepEqual(answers, [['r', 'call', { q1: 'changed', q2: 'two' }]])
})

test('stop keeps the request active until the main process finishes cancelling', async () => {
  let stopped
  const previous = window.aster.chat.stop
  window.aster.chat.stop = () => new Promise(resolve => { stopped = resolve })
  useAppStore.setState({ activeRequest: { requestId: 'r', messageId: 'm', conversationId: 'c', startedAt: Date.now() } })
  const pending = useAppStore.getState().stopGeneration()
  assert.equal(useAppStore.getState().activeRequest.requestId, 'r')
  stopped()
  await pending
  assert.equal(useAppStore.getState().activeRequest, null)
  window.aster.chat.stop = previous
})

function renderPicker() {
  const internal = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
  const previous = internal.ReactCurrentDispatcher.current
  internal.ReactCurrentDispatcher.current = {
    useState: value => [typeof value === 'function' ? value() : value, () => {}], useRef: value => ({ current: value }),
    useMemo: callback => callback(), useCallback: callback => callback, useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
    useDebugValue() {}, useEffect() {}, useLayoutEffect() {},
  }
  try { return ModelPicker({}) } finally { internal.ReactCurrentDispatcher.current = previous }
}
function findRefresh(node) {
  if (!node || typeof node !== 'object') return
  const children = React.Children.toArray(node.props?.children)
  if (node.type === 'button' && children.some(child => typeof child === 'string' && child.includes('刷新'))) return node
  for (const child of children) { const found = findRefresh(child); if (found) return found }
}
const tick = () => new Promise(resolve => setImmediate(resolve))

test('model refresh preserves settings saved during the network request', async () => {
  let finish
  window.aster.models.fetch = () => new Promise(resolve => { finish = resolve })
  findRefresh(renderPicker()).props.onClick()
  await useAppStore.getState().updateSettings({ userName: 'newer saved value' })
  finish({ models: [{ id: 'new-model' }], latencyMs: 5 })
  await tick()
  assert.equal(useAppStore.getState().config.settings.userName, 'newer saved value')
  assert.equal(useAppStore.getState().config.profiles[1].models[0].id, 'new-model')
})

test('late model refresh does not resurrect a deleted service or change another conversation', async () => {
  let finish
  const a = conversation('a')
  const b = conversation('b')
  const initial = config()
  initial.profiles[0].chatModel = ''
  a.model = ''
  useAppStore.setState({ config: initial, conversations: [a, b], activeId: a.id })
  window.aster.models.fetch = () => new Promise(resolve => { finish = resolve })
  findRefresh(renderPicker()).props.onClick()
  useAppStore.setState({ activeId: b.id })
  await useAppStore.getState().saveConfig({ ...initial, profiles: [initial.profiles[1]] })
  finish({ models: [{ id: 'a-new-model' }], latencyMs: 5 })
  await tick()
  assert.deepEqual(useAppStore.getState().config.profiles.map(p => p.id), ['b'])
  assert.equal(useAppStore.getState().conversations.find(c => c.id === b.id).model, 'b-chat')
})
