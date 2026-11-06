/** A standalone Node process owns the official SDK and its native runtime. */
const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<typeof import('@deepseek-ai/dsh-sdk-client')>
let harness: InstanceType<(typeof import('@deepseek-ai/dsh-sdk-client'))['DeepSeekHarness']> | undefined
let nextInteraction = 0
const interactions = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
const send = (value: unknown) => { if (process.connected) process.send?.(value) }

function interact(kind: string, payload: unknown, signal?: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = ++nextInteraction
    const cleanup = () => { interactions.delete(id); signal?.removeEventListener('abort', abort) }
    const abort = () => { cleanup(); reject(new Error('交互已取消')) }
    if (signal?.aborted) { abort(); return }
    interactions.set(id, { resolve: value => { cleanup(); resolve(value) }, reject: error => { cleanup(); reject(error) } })
    signal?.addEventListener('abort', abort, { once: true })
    send({ type: 'interaction', id, kind, payload })
  })
}

process.on('message', async (raw: unknown) => {
  const message = raw as { type: string; id: number; action?: string; value?: unknown; error?: string }
  if (message.type === 'answer') {
    const pending = interactions.get(message.id)
    if (message.error) pending?.reject(new Error(message.error))
    else pending?.resolve(message.value)
    return
  }
  if (message.type !== 'request') return
  const value = message.value as Record<string, unknown>
  try {
    let result: unknown
    if (message.action === 'initialize') {
      const { DeepSeekHarness } = await dynamicImport('@deepseek-ai/dsh-sdk-client')
      harness = new DeepSeekHarness({
        ...value,
        onUserQuestion: (question, context) => interact('question', question, context.signal) as Promise<import('@deepseek-ai/dsh-sdk-client').SdkUserQuestionResult>,
      })
      harness.client.start()
      harness.client.onRequest((method, params) => interact('approval', { method, params }))
      let bridgeReady!: () => void
      const bridge = new Promise<void>(resolve => { bridgeReady = resolve })
      const live = harness.client.subscribe(notification => notification.method.startsWith('aster.'))
      void (async () => { try { for await (const notification of live) { if (notification.method === 'aster.ready') bridgeReady(); send({ type: 'notification', value: notification }) } } catch { /* Runtime closure ends the feed. */ } })()
      await harness.start()
      let timer: NodeJS.Timeout | undefined
      try { await Promise.race([bridge, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Aster 运行时策略未能加载，已阻止执行任务')), 3000) })]) } finally { clearTimeout(timer) }
    } else if (message.action === 'resume') await harness!.resumeSession(String(value.sessionId))
    else if (message.action === 'workspace') result = await harness!.client.setWorkingDirectory(String(value.sessionId), String(value.path))
    else if (message.action === 'run') {
      result = await harness!.run(value.content as import('@deepseek-ai/dsh-sdk-client').SdkPromptContentBlock[], {
        sessionId: String(value.sessionId),
        onNotification: notification => { if (!notification.method.startsWith('aster.')) send({ type: 'notification', value: notification }) },
      })
    } else if (message.action === 'close') {
      for (const pending of interactions.values()) pending.reject(new Error('任务已停止'))
      await harness?.close()
      send({ type: 'response', id: message.id })
      process.disconnect?.()
      return
    } else throw new Error('未知 SDK 操作')
    send({ type: 'response', id: message.id, value: result })
  } catch (error) {
    send({ type: 'response', id: message.id, error: error instanceof Error ? error.message : String(error) })
  }
})

process.once('disconnect', () => { void harness?.close().finally(() => process.exit(0)) })
