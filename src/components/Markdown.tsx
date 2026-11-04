import { isValidElement, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from '@/components/CodeBlock'

export function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            const child = Array.isArray(children) ? children[0] : children
            if (isValidElement(child)) {
              const props = child.props as { className?: string; children?: ReactNode }
              const code = String(props.children ?? '').replace(/\n$/, '')
              const match = /language-([\w-]+)/.exec(props.className ?? '')
              return <CodeBlock code={code} language={match?.[1]} />
            }
            return <pre>{children}</pre>
          },
          code({ className, children }) {
            return <code className={className}>{children}</code>
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                onClick={event => {
                  event.preventDefault()
                  if (href && /^https?:\/\//i.test(href)) {
                    void window.aster.app.openExternal(href)
                  }
                }}
              >
                {children}
              </a>
            )
          },
          table({ children }) {
            return (
              <div className="scroll-quiet overflow-x-auto">
                <table>{children}</table>
              </div>
            )
          },
          img({ src, alt }) {
            if (!src) return null
            return <img src={src} alt={alt ?? ''} loading="lazy" />
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
