import { ArrowDown } from 'lucide-react'
import { useEffect } from 'react'
import { Composer } from '@/components/Composer'
import { MessageItem } from '@/components/MessageItem'
import { Welcome } from '@/components/Welcome'
import { useAppStore, activeConversation } from '@/state/store'
import { useScrollPinning } from '@/lib/useScrollPinning'

export function ChatView() {
  const conversation = useAppStore(activeConversation)
  const activeRequest = useAppStore(state => state.activeRequest)
  const messages = conversation?.messages ?? []
  const last = messages[messages.length - 1]
  const lastAssistantId = [...messages].reverse().find(message => message.role === 'assistant')?.id
  const streamingHere = Boolean(activeRequest && conversation && activeRequest.conversationId === conversation.id)
  const streamingMessageId = streamingHere ? activeRequest?.messageId : undefined

  const {
    containerRef,
    showJumpControl,
    markUserInput,
    handleScroll,
    scrollToBottom,
    atTop,
    atBottom,
  } = useScrollPinning([
    conversation?.id,
    messages.length,
    last?.content.length,
    last?.reasoning.length,
    streamingMessageId,
  ])

  useEffect(() => {
    if (conversation?.id) {
      scrollToBottom(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id])

  if (!conversation || messages.length === 0) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <Welcome />
      </div>
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-transparent">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        onWheel={markUserInput}
        onTouchMove={markUserInput}
        onKeyDown={markUserInput}
        className="scroll-quiet chat-scroll-mask relative min-h-0 flex-1 overflow-y-auto"
        style={{
          '--cds-scroll-fade-top': atTop ? '0px' : '26px',
          '--cds-scroll-fade-bottom': atBottom ? '0px' : '26px',
        } as React.CSSProperties}
      >
        <div className="message-column pb-4 pt-5">
          {messages.map(message => (
            <MessageItem
              key={message.id}
              message={message}
              isLastAssistant={message.id === lastAssistantId}
              streamingHere={streamingHere}
            />
          ))}
          <div className="h-2" />
        </div>
      </div>

      <div className="relative z-10 shrink-0">
        <div className="pointer-events-none absolute inset-x-0 -top-10 h-10 bg-gradient-to-t from-[var(--cds-surface-1)] to-transparent" />
        {showJumpControl && (
          <button
            type="button"
            onClick={() => scrollToBottom(true)}
            className="app-pop-in absolute -top-11 right-7 z-20 flex h-7 items-center gap-1.5 rounded-full border border-[var(--cds-border)] bg-[var(--cds-surface-popover)] px-2.5 text-[10.5px] font-medium text-[var(--cds-text-secondary)] shadow-popover backdrop-blur transition-colors hover:text-[var(--cds-text-primary)]"
          >
            <ArrowDown size={11} />
            回到最新
          </button>
        )}
        <div className="px-6 pb-3.5 pt-1.5">
          <div className="mx-auto w-full max-w-[780px]">
            <Composer />
          </div>
        </div>
      </div>
    </div>
  )
}
