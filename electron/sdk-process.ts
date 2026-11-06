import { fork, type ChildProcess } from 'node:child_process'
import path from 'node:path'

export interface SdkNotification { method: string; params: Record<string, unknown> }

/** Isolates Node-native dsh dependencies from Electron's V8 fingerprint. */
export class SdkProcess {
  private readonly child: ChildProcess
  private sequence = 0
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  private closing?: Promise<void>
  private stderr = ''
  private exited: Promise<void>
  onNotification?: (notification: SdkNotification) => void
  onInteraction?: (kind: string, payload: unknown) => Promise<unknown>

  constructor(env: NodeJS.ProcessEnv) {
    const physical = (file: string) => file.replace(/app\.asar(?=\/|$)/, 'app.asar.unpacked')
    const node = physical(require.resolve('node/bin/node'))
    this.child = fork(physical(path.join(__dirname, 'sdk-worker.js')), [], { execPath: node, env: { ...env, ELECTRON_RUN_AS_NODE: undefined }, silent: true, detached: process.platform !== 'win32' })
    this.child.stderr?.on('data', data => { this.stderr = (this.stderr + String(data)).slice(-5000) })
    this.child.on('message', (raw: unknown) => {
      const message = raw as { type: string; id: number; value?: unknown; error?: string; kind?: string; payload?: unknown }
      if (message.type === 'response') {
        const waiter = this.pending.get(message.id)
        this.pending.delete(message.id)
        if (message.error) waiter?.reject(new Error(message.error))
        else waiter?.resolve(message.value)
      } else if (message.type === 'notification') this.onNotification?.(message.value as SdkNotification)
      else if (message.type === 'interaction') {
        void this.onInteraction?.(String(message.kind), message.payload).then(
          value => { if (this.child.connected) this.child.send({ type: 'answer', id: message.id, value }) },
          error => { if (this.child.connected) this.child.send({ type: 'answer', id: message.id, error: error instanceof Error ? error.message : String(error) }) },
        )
      }
    })
    this.exited = new Promise(resolve => {
      const fail = (error: Error) => { this.pending.forEach(waiter => waiter.reject(error)); this.pending.clear(); resolve() }
      this.child.once('exit', code => fail(new Error(`任务运行时已退出 (${code})${this.stderr ? `：${this.stderr}` : ''}`)))
      this.child.once('error', fail)
    })
  }

  request<T = unknown>(action: string, value: unknown = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence
      if (!this.child.connected) { reject(new Error('任务运行时连接已关闭')); return }
      this.pending.set(id, { resolve: result => resolve(result as T), reject })
      this.child.send({ type: 'request', id, action, value }, error => {
        if (error) { this.pending.delete(id); reject(error) }
      })
    })
  }

  close(): Promise<void> {
    return this.closing ??= (async () => {
      const force = setTimeout(() => {
        try { if (process.platform !== 'win32' && this.child.pid) process.kill(-this.child.pid, 'SIGKILL'); else this.child.kill('SIGKILL') } catch { /* Already reaped. */ }
      }, 15000)
      try {
        if (this.child.connected) await this.request('close').catch(() => {})
        await this.exited
      } finally { clearTimeout(force) }
    })()
  }
}
