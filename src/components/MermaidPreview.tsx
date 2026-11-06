import { useEffect, useId, useState } from 'react'

export function MermaidPreview({ content }: { content: string }) {
  const id = useId().replace(/:/g, '')
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let current = true
    const render = async () => {
      setError('')
      try {
        const { default: mermaid } = await import('mermaid')
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: document.documentElement.classList.contains('dark') ? 'dark' : 'neutral' })
        const result = await mermaid.render(`aster-diagram-${id}`, content)
        if (current) setSvg(result.svg)
      } catch (cause) {
        if (current) { setSvg(''); setError(cause instanceof Error ? cause.message : String(cause)) }
      }
    }
    void render()
    const observer = new MutationObserver(() => { void render() })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => { current = false; observer.disconnect() }
  }, [content, id])
  if (error) return <p role="alert" className="p-5 text-sm text-[var(--cds-text-secondary)]">图表无法渲染，请切换源码检查语法。<span className="mt-2 block whitespace-pre-wrap font-mono text-xs">{error}</span></p>
  if (!svg) return <p role="status" className="p-5 text-sm text-[var(--cds-text-muted)]">正在绘制图表…</p>
  return <div className="mermaid-preview flex min-h-full items-center justify-center p-5" dangerouslySetInnerHTML={{ __html: svg }} />
}
