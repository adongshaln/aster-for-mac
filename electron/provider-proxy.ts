import { createServer, type Server } from 'node:http'
import { randomBytes } from 'node:crypto'
import { Readable } from 'node:stream'
import type { ChatRequest, Profile } from '../shared/types'
import { usesResponses, writeReasoning } from '../shared/reasoning'

export function providerProtocol(profile: Profile, model: string): string {
  return usesResponses(model) ? 'openai-responses' : profile.apiFormat === 'anthropic' ? 'anthropic-messages' : 'openai-completions'
}

function endpoint(base: string, route: string): string {
  if (/^https?:\/\//i.test(route)) return route
  const root = base.replace(/\/+$/, '')
  const relative = route.replace(/^\/+/, '')
  return `${root}/${/\/v1$/i.test(root) ? relative.replace(/^v1\//i, '') : relative}`
}

/** A per-run loopback route keeps real credentials out of the agent subprocess. */
export async function createProviderProxy(profile: Profile, key: string, request: ChatRequest, signal: AbortSignal) {
  const token = randomBytes(32).toString('hex')
  const protocol = providerProtocol(profile, request.model)
  const anthropic = protocol === 'anthropic-messages'
  const target = endpoint(profile.baseUrl, anthropic ? profile.messagesPath : protocol === 'openai-responses' ? profile.responsesPath : profile.chatPath)
  const connections = new Set<AbortController>()
  const server: Server = createServer(async (incoming, outgoing) => {
    if (incoming.headers.authorization !== `Bearer ${token}` && incoming.headers['x-api-key'] !== token) {
      outgoing.writeHead(403).end(); return
    }
    if (incoming.method !== 'POST' || !['/v1/chat/completions', '/v1/responses', '/v1/messages'].some(route => incoming.url?.split('?')[0] === route)) {
      outgoing.writeHead(404).end(); return
    }
    const controller = new AbortController()
    const abort = () => controller.abort()
    connections.add(controller)
    signal.addEventListener('abort', abort, { once: true })
    outgoing.on('close', () => { if (!outgoing.writableEnded) controller.abort() })
    try {
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of incoming) {
        size += chunk.length
        if (size > 40 * 1024 * 1024) throw new Error('模型请求超过 40 MB')
        chunks.push(Buffer.from(chunk))
      }
      signal.throwIfAborted()
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
      body.model = request.model
      writeReasoning(body, request.model, request.effort, protocol === 'openai-responses', Number(body.max_tokens ?? body.max_output_tokens) || 8192)
      const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'text/event-stream' }
      for (const line of profile.extraHeaders.split('\n')) {
        const index = line.indexOf(':')
        const name = line.slice(0, index).trim()
        if (index > 0 && !['authorization', 'x-api-key', 'host', 'content-length', 'connection'].includes(name.toLowerCase())) headers[name] = line.slice(index + 1).trim()
      }
      if (anthropic) {
        headers['anthropic-version'] = '2023-06-01'
        if (key) headers['x-api-key'] = key
      } else if (key) headers.Authorization = `Bearer ${key}`
      const response = await fetch(target, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal })
      outgoing.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/json' })
      if (response.body) {
        const stream = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0])
        stream.on('error', error => outgoing.destroy(error))
        stream.pipe(outgoing)
        await new Promise<void>(resolve => { outgoing.once('finish', resolve); outgoing.once('close', resolve) })
      } else outgoing.end()
    } catch (error) {
      if (!outgoing.headersSent) outgoing.writeHead(502, { 'content-type': 'application/json' })
      outgoing.end(JSON.stringify({ error: { message: signal.aborted ? '请求已取消' : error instanceof Error ? error.message : String(error) } }))
    } finally {
      signal.removeEventListener('abort', abort)
      connections.delete(controller)
    }
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('无法启动模型连接')
  return {
    token, protocol, baseURL: `http://127.0.0.1:${address.port}${anthropic ? '' : '/v1'}`,
    async close() {
      connections.forEach(controller => controller.abort())
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    },
  }
}
