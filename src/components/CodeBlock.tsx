import hljs from 'highlight.js/lib/common'
import { Check, Copy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { copyText } from '@/lib/utils'

export function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false)
  const languageLabel = (language || 'text').toLowerCase()
  const html = useMemo(() => {
    const source = code.replace(/\n$/, '')
    try {
      if (language && hljs.getLanguage(language)) {
        return hljs.highlight(source, { language, ignoreIllegals: true }).value
      }
      return hljs.highlightAuto(source).value
    } catch {
      return escapeHtml(source)
    }
  }, [code, language])

  const onCopy = async () => {
    const ok = await copyText(code.replace(/\n$/, ''))
    if (!ok) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="code-block group/code">
      <div className="flex h-9 items-center justify-between border-b border-white/[0.06] px-3.5">
        <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-white/40">{languageLabel}</span>
        <button
          type="button"
          onClick={onCopy}
          className="flex h-6 items-center gap-1 rounded px-1.5 font-sans text-[10.5px] font-medium text-white/45 transition-colors hover:bg-white/[0.07] hover:text-white/85"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="scroll-quiet">
        <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  )
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
