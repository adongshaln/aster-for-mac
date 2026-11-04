import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs)
}

export function uid(): string {
  return crypto.randomUUID()
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return ''
  if (ms < 1000) return `${Math.round(ms)} ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} 秒`
  const minutes = Math.floor(seconds / 60)
  return `${minutes} 分 ${Math.round(seconds % 60)} 秒`
}

export function formatClock(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

export function relativeTime(timestamp: number): string {
  const delta = Date.now() - timestamp
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days === 1) return '昨天'
  if (days < 7) return `${days} 天前`
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(timestamp))
}

export function dayBucket(timestamp: number): 'pinned' | 'today' | 'yesterday' | 'week' | 'older' {
  const now = new Date()
  const date = new Date(timestamp)
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (timestamp >= startToday) return 'today'
  if (timestamp >= startToday - 86_400_000) return 'yesterday'
  if (timestamp >= startToday - 6 * 86_400_000) return 'week'
  return 'older'
}

export function greeting(userName: string): string {
  const hour = new Date().getHours()
  const name = userName.trim()
  const prefix = hour < 6 ? '夜深了' : hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'
  return name ? `${prefix}，${name}` : prefix
}

export function truncateTitle(text: string, max = 30): string {
  const clean = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~\[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean) return '新对话'
  return clean.length <= max ? clean : `${clean.slice(0, max).trimEnd()}…`
}

export function estimateHistoryTokens(messages: { content: string; attachments?: unknown[] }[]): number {
  return messages.reduce((sum, message) => {
    const images = Array.isArray(message.attachments) ? message.attachments.length : 0
    return sum + Math.ceil(message.content.length / 3.5) + images * 1200 + 8
  }, 0)
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export interface LoadedImage {
  name: string
  mimeType: string
  base64: string
  width: number
  height: number
  size: number
}

export async function readImageFile(file: File): Promise<LoadedImage> {
  if (!file.type.startsWith('image/')) throw new Error('只能上传图片文件')
  if (file.size > 20 * 1024 * 1024) throw new Error('单张图片不能超过 20 MB')
  const bitmap = await createImageBitmap(file)
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
  const base64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl
  const width = bitmap.width
  const height = bitmap.height
  bitmap.close()
  return {
    name: file.name || 'image',
    mimeType: file.type || 'image/jpeg',
    base64,
    width,
    height,
    size: file.size,
  }
}

export function isMac(): boolean {
  return navigator.platform.toLowerCase().includes('mac') || navigator.userAgent.includes('Mac')
}
