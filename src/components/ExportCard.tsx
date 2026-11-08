import { forwardRef, type CSSProperties } from 'react'
import type { Attachment, ChatCitation, ChatMessage, Conversation } from '@shared/types'
import { ExportMarkdown } from '@/components/ExportMarkdown'
import { cleanQuestionText } from '@/lib/markdown-clean'
import {
  EXPORT_CARD_WIDTH,
  formatExportDay,
  formatExportTime,
  stylesForTemplate,
  type ExportRound,
  type ExportTemplate,
} from '@/lib/export-image'

export interface ExportOptions {
  includeReasoning: boolean
  includeCitations: boolean
  includeAttachments: boolean
}

export interface ExportCardProps {
  conversation: Conversation
  rounds: ExportRound[]
  template: ExportTemplate
  options: ExportOptions
  attachmentUrls: Record<string, string>
  exportedAt: number
}

function ExportStar({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M16 0.8c.55 8.28 6.92 14.65 15.2 15.2-8.28.55-14.65 6.92-15.2 15.2C15.45 22.92 9.08 16.55.8 16 9.08 15.45 15.45 9.08 16 .8Z" />
    </svg>
  )
}

function AttachmentStrip({ attachments, urls }: { attachments: Attachment[]; urls: Record<string, string> }) {
  if (!attachments.length) return null
  return (
    <div className="aster-export__attachments">
      {attachments.map(attachment => {
        const src = urls[attachment.id]
        return src ? (
          <div key={attachment.id} className="aster-export__attachment">
            <img src={src} alt={attachment.name} />
          </div>
        ) : (
          <div key={attachment.id} className="aster-export__attachment aster-export__attachment--placeholder">
            图片附件
          </div>
        )
      })}
    </div>
  )
}

function CitationList({ citations }: { citations: ChatCitation[] }) {
  if (!citations.length) return null
  return (
    <div className="aster-export__citations">
      <div className="aster-export__citations-title">参考来源</div>
      {citations.map((citation, index) => {
        let host = citation.siteName ?? ''
        if (!host) {
          try {
            host = new URL(citation.url).hostname.replace(/^www\./, '')
          } catch {
            host = ''
          }
        }
        return (
          <div key={`${citation.url}-${index}`} className="aster-export__citation">
            <span className="aster-export__citation-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="aster-export__citation-title">{citation.title || host || citation.url}</span>
            {host && <span className="aster-export__citation-host">· {host}</span>}
          </div>
        )
      })}
    </div>
  )
}

function Answer({
  message,
  options,
  attachmentUrls,
}: {
  message: ChatMessage
  options: ExportOptions
  attachmentUrls: Record<string, string>
}) {
  const citations = message.citations ?? []
  return (
    <div className="aster-export__answer">
      <div className="aster-export__label">
        <span className="aster-export__badge aster-export__badge--assistant">Aster</span>
        {message.model && <span>{message.model}</span>}
        <span className="aster-export__time">{formatExportTime(message.createdAt)}</span>
      </div>
      {options.includeReasoning && message.reasoning.trim() && (
        <div className="aster-export__reasoning">
          <span className="aster-export__reasoning-label">思考过程</span>
          {message.reasoning.trim()}
        </div>
      )}
      {options.includeAttachments && <AttachmentStrip attachments={message.attachments} urls={attachmentUrls} />}
      {message.content.trim() ? (
        <ExportMarkdown content={message.content} />
      ) : !(options.includeAttachments && message.attachments.length) ? (
        <div className="aster-export__status">（本轮没有正文）</div>
      ) : null}
      {message.status === 'stopped' && message.content.trim() && (
        <div className="aster-export__status">已停止生成</div>
      )}
      {message.status === 'error' && (
        <div className="aster-export__status">生成失败{message.error ? `：${message.error}` : ''}</div>
      )}
      {options.includeCitations && <CitationList citations={citations} />}
    </div>
  )
}

export const ExportCard = forwardRef<HTMLDivElement, ExportCardProps>(function ExportCard(
  { conversation, rounds, template, options, attachmentUrls, exportedAt },
  ref,
) {
  const model = conversation.model || rounds.flatMap(round => round.assistants).find(message => message.model)?.model || ''
  const title = conversation.title.trim() || '对话记录'

  return (
    <div
      ref={ref}
      className="aster-export"
      style={{ ...stylesForTemplate(template), width: EXPORT_CARD_WIDTH } as CSSProperties}
    >
      <div className="aster-export__top">
        <div className="aster-export__brand">
          <ExportStar size={34} className="aster-export__mark" />
          <span className="aster-export__wordmark">Aster</span>
          <span className="aster-export__kind">对话记录</span>
        </div>
        <div className="aster-export__meta">
          {formatExportDay(exportedAt)}
          <br />
          共 {rounds.length} 轮
        </div>
      </div>

      <h1 className="aster-export__title">{title}</h1>
      <div className="aster-export__subtitle">
        {model ? `${model} · ` : ''}Aster for macOS
      </div>
      <div className="aster-export__rule" />

      {rounds.map(round => (
        <section key={round.id} className="aster-export__round">
          {round.user && (
            <>
              <div className="aster-export__label">
                <span className="aster-export__badge">你</span>
                <span className="aster-export__time">{formatExportTime(round.user.createdAt)}</span>
              </div>
              {options.includeAttachments && (
                <AttachmentStrip attachments={round.user.attachments} urls={attachmentUrls} />
              )}
              {round.user.content.trim() && (
                <div className="aster-export__question">{cleanQuestionText(round.user.content)}</div>
              )}
            </>
          )}
          {round.assistants.map(message => (
            <Answer key={message.id} message={message} options={options} attachmentUrls={attachmentUrls} />
          ))}
        </section>
      ))}

      <div className="aster-export__footer">
        <span className="aster-export__footer-mark">
          <ExportStar size={13} />
          Aster · 对话记录
        </span>
        <span>本地排版 · 不经过模型</span>
      </div>
    </div>
  )
})
