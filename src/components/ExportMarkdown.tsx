import { isValidElement, useMemo, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cleanMarkdownForExport } from '@/lib/markdown-clean'

function codeBlock(children: ReactNode): { code: string; language: string } {
  const child = Array.isArray(children) ? children[0] : children
  if (isValidElement(child)) {
    const props = child.props as { className?: string; children?: ReactNode }
    const language = /language-([\w-]+)/.exec(props.className ?? '')?.[1] ?? ''
    const raw = props.children
    const code = Array.isArray(raw) ? raw.join('') : String(raw ?? '')
    return { code: code.replace(/\n$/, ''), language }
  }
  return { code: '', language: '' }
}

export function ExportMarkdown({ content }: { content: string }) {
  const cleaned = useMemo(() => cleanMarkdownForExport(content), [content])
  if (!cleaned) return null

  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            const { code, language } = codeBlock(children)
            return (
              <div className="ex-code">
                <div className="ex-code__bar">
                  <span>{language || '代码'}</span>
                </div>
                <pre>
                  <code>{code}</code>
                </pre>
              </div>
            )
          },
          a({ href, children }) {
            return (
              <span className="ex-link" title={href}>
                {children}
              </span>
            )
          },
          img({ alt }) {
            return <span className="ex-image-placeholder">［图片{alt ? `：${alt}` : ''}］</span>
          },
          input({ checked }) {
            return <span className="ex-checkbox">{checked ? '✓' : '○'}</span>
          },
        }}
      >
        {cleaned}
      </ReactMarkdown>
    </div>
  )
}
